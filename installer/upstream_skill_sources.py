"""Resolve and copy selected files from an external skill's GitHub source."""
from __future__ import annotations

from collections.abc import Mapping
import gzip
import io
from pathlib import PurePosixPath
import re
import tarfile
import zlib


_COMPONENT = re.compile(r"[A-Za-z0-9_.-]{1,128}")
_REPOSITORY = re.compile(r"https://github\.com/([A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*)\.git")
_DEVICES = {"CON", "PRN", "AUX", "NUL", *(f"{prefix}{i}" for prefix in ("COM", "LPT") for i in range(1, 10))}
_MAX_COMPRESSED_BYTES = 64 * 1024 * 1024
_MAX_TAR_BYTES = 128 * 1024 * 1024


def validate_skill_file_path(value: str) -> str:
    """Return a safe relative POSIX path unchanged."""
    if (not isinstance(value, str) or len(value) > 4096
            or any(not _COMPONENT.fullmatch(part) or part.endswith(".") or part.casefold() == ".git"
                   or part.split(".", 1)[0].upper() in _DEVICES for part in value.split("/"))):
        raise ValueError(f"Invalid skill file path {value!r}; use safe relative POSIX paths")
    return value


def _is_directory(member: tarfile.TarInfo) -> bool:
    return member.isdir() and member.size == 0 and not member.issparse()


def _matching_members(archive: tarfile.TarFile, selections: Mapping[str, str]) -> dict[str, tarfile.TarInfo]:
    sources = set(selections.values())
    prefixes = tuple(f"{source}/" for source in sources)
    parents = {parent.as_posix() for source in sources for parent in PurePosixPath(source).parents}
    parents.discard(".")
    matches = {}
    archive_root = None
    for member in archive:
        root, _, relative = member.name.partition("/")
        if archive_root is None:
            if not re.fullmatch(r"[A-Za-z0-9_.-]+", root) or root.endswith(".") or root.casefold() == ".git":
                raise ValueError(f"Invalid GitHub archive root in {member.name!r}")
            archive_root = root
        if root != archive_root or (not relative and not _is_directory(member)):
            raise ValueError(f"Expected a single GitHub archive directory at {member.name!r}")
        if relative in sources or relative in parents or relative.startswith(prefixes):
            if relative in matches:
                raise ValueError(f"Duplicate archive entry in selected source: {relative!r}")
            matches[relative] = member

    for parent in parents.intersection(matches):
        if not _is_directory(matches[parent]):
            raise ValueError(f"Selected source passes through non-directory entry {parent!r}")
    return matches


def _register_output(paths: dict[str, tuple[str, bool]], path: str, *, directory: bool) -> None:
    parts = validate_skill_file_path(path).split("/")
    for count in range(1, len(parts) + 1):
        prefix = "/".join(parts[:count])
        is_directory = directory or count < len(parts)
        identity = (prefix, is_directory)
        previous = paths.setdefault(prefix.casefold(), identity)
        if previous != identity:
            raise ValueError(f"Conflicting skill output paths {previous[0]!r} and {prefix!r}")


def _selected_files(archive: tarfile.TarFile, selections: Mapping[str, str]) -> dict[str, tarfile.TarInfo]:
    matches = _matching_members(archive, selections)
    paths: dict[str, tuple[str, bool]] = {}
    files: dict[str, tarfile.TarInfo] = {}

    def add_output(path: str, member: tarfile.TarInfo) -> None:
        directory = _is_directory(member)
        if not directory and (member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE)
                              or member.issparse() or member.size < 0):
            raise ValueError(f"Unsupported archive entry {member.name!r} for {path!r}; expected a regular file or directory")
        _register_output(paths, path, directory=directory)
        if not directory:
            if path in files:
                raise ValueError(f"Duplicate skill output file {path!r}")
            files[path] = member

    for destination, source in selections.items():
        member = matches.get(source)
        prefix = f"{source}/"
        children = {path[len(prefix):]: child for path, child in matches.items() if path.startswith(prefix)}
        if member is None and not children:
            raise ValueError(f"Missing selected source {source!r} for {destination!r}")
        if member is not None and not _is_directory(member):
            if destination == "." or children:
                raise ValueError(f"Selected source {source!r} for {destination!r} must be a directory")
            add_output(destination, member)
            continue

        if destination != ".":
            _register_output(paths, destination, directory=True)
        for relative, child in children.items():
            output = relative if destination == "." else f"{destination}/{relative}"
            add_output(output, child)
    return files


def _read_payload(data: bytes, selections: Mapping[str, str]) -> dict[str, bytes]:
    if len(data) > _MAX_COMPRESSED_BYTES:
        raise ValueError("Compressed source archive exceeds 64 MiB")
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as compressed:
            tar_data = compressed.read(_MAX_TAR_BYTES + 1)
        if len(tar_data) > _MAX_TAR_BYTES:
            raise ValueError("Uncompressed source archive exceeds 128 MiB")
        with tarfile.open(fileobj=io.BytesIO(tar_data), mode="r:") as archive:
            payload = {}
            for path, member in _selected_files(archive, selections).items():
                with archive.extractfile(member) as source:
                    payload[path] = source.read()
            return payload
    except (tarfile.TarError, OSError, EOFError, zlib.error) as exc:
        raise ValueError(f"Invalid GitHub tar.gz archive: {exc}") from exc


def fetch_skill(spec: Mapping, *, fetch, github, release) -> tuple[str, dict[str, bytes]]:
    """Resolve an exact commit and return its selected skill payload in memory."""
    try:
        source = _REPOSITORY.fullmatch(spec["source"])
        if not source:
            raise ValueError("Expected an HTTPS github.com/OWNER/REPO.git source")
        repo = source[1]
        selections = spec["files"]
        for destination, path in selections.items():
            if destination != ".":
                validate_skill_file_path(destination)
            validate_skill_file_path(path)

        channel = spec["channel"]
        if channel == "default-branch":
            metadata = github(repo, "commits/HEAD")
            commit = metadata.get("sha") if isinstance(metadata, Mapping) else None
        elif channel == "latest-release":
            _, commit = release(repo)
        else:
            raise ValueError(f"Unsupported source channel {channel!r}")
        if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
            raise ValueError(f"{repo} {channel} did not resolve to an exact Git commit SHA")

        archive = fetch(f"https://codeload.github.com/{repo}/tar.gz/{commit}")
        payload = _read_payload(archive, selections)
        if spec["role"] == "upstream" and "SKILL.md" not in payload:
            raise ValueError("Selected source files must provide SKILL.md at the skill root")
        if not payload:
            raise ValueError("Selected source paths contain no regular files")
        return commit, payload
    except ValueError as exc:
        raise ValueError(f"External skill {spec['name']!r}: {exc}") from exc
