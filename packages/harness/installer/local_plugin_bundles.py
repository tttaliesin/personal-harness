"""Verify approved physical Codex plugin bundles without installing them."""
from __future__ import annotations

from collections.abc import Mapping
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat

if __package__:
    from .windows_paths import io_path
else:
    from windows_paths import io_path

if os.name == "nt":
    from ctypes import WinDLL, wintypes

    # Unlike lstat, this checks the attributes of every kind of reparse point
    # without resolving the final component.
    _get_file_attributes = WinDLL("kernel32").GetFileAttributesW
    _get_file_attributes.argtypes = (wintypes.LPCWSTR,)
    _get_file_attributes.restype = wintypes.DWORD


_MARKETPLACE_MANIFEST = ".agents/plugins/marketplace.json"
_PLUGIN_MANIFEST = ".codex-plugin/plugin.json"


def _physical_mode(path: Path) -> int:
    if os.name == "nt":
        attributes = _get_file_attributes(str(path))
        if attributes == 0xFFFFFFFF:
            raise OSError("Unable to read bundle path attributes")
        if attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise ValueError("Bundle paths cannot contain symlinks or reparse points")

    metadata = path.lstat()
    if (stat.S_ISLNK(metadata.st_mode)
            or getattr(metadata, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT):
        raise ValueError("Bundle paths cannot contain symlinks or reparse points")
    return metadata.st_mode


def _check_directories(path: Path) -> None:
    for directory in (*reversed(path.parents), path):
        if not stat.S_ISDIR(_physical_mode(directory)):
            raise ValueError("Bundle directory path contains a non-directory")


def _bundle_files(root: Path) -> tuple[Path, dict[str, str]]:
    hashes = {}
    try:
        absolute = root.absolute()
        # Check ancestors before resolving, including components before any '..'.
        _check_directories(absolute)
        canonical = absolute.resolve(strict=True)
        base = io_path(canonical)
        pending = [base]
        while pending:
            for path in pending.pop().iterdir():
                mode = _physical_mode(path)
                if stat.S_ISDIR(mode):
                    pending.append(path)
                elif stat.S_ISREG(mode):
                    with path.open("rb") as stream:
                        file_digest = hashlib.file_digest(stream, "sha256").hexdigest()
                    hashes[path.relative_to(base).as_posix()] = file_digest
                else:
                    raise ValueError("Bundle tree can contain only directories and regular files")
    except OSError:
        raise OSError("Unable to read the bundle directory or one of its files") from None
    return canonical, hashes


def _digest(hashes: dict[str, str]) -> str:
    encoded = json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def directory_digest(root: Path) -> str:
    """Hash every regular file in a physical directory by its relative path."""
    _, hashes = _bundle_files(root)
    return _digest(hashes)


def _unique_members(pairs: list[tuple[str, object]]) -> dict:
    members = dict(pairs)
    if len(members) != len(pairs):
        raise ValueError("Duplicate JSON object key")
    return members


def _reject_constant(_: str) -> None:
    raise ValueError("Invalid JSON constant")


def _read_manifest(root: Path, hashes: dict[str, str], relative: str, label: str) -> dict:
    expected = hashes.get(relative)
    if expected is None:
        raise ValueError(f"Bundle is missing the {label} manifest file")

    path = io_path(root / relative)
    try:
        _check_directories(path.parent)
        if not stat.S_ISREG(_physical_mode(path)):
            raise ValueError(f"The {label} manifest must be a regular file")
        data = path.read_bytes()
    except OSError:
        raise OSError(f"Unable to read the {label} manifest file") from None
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"The {label} manifest changed during bundle inspection")

    try:
        manifest = json.loads(data.decode("utf-8"), object_pairs_hook=_unique_members,
                              parse_constant=_reject_constant)
    except (ValueError, RecursionError):
        raise ValueError(f"Malformed {label} manifest JSON") from None
    if not isinstance(manifest, dict):
        raise ValueError(f"The {label} manifest must be a JSON object")
    return manifest


def _plugin_prefix(marketplace: dict, name: str) -> str:
    entries = marketplace.get("plugins")
    if not isinstance(entries, list) or any(
        not isinstance(entry, dict) or not isinstance(entry.get("name"), str) or not entry["name"]
        for entry in entries
    ):
        raise ValueError("Marketplace manifest must contain a list of named plugin entries")
    matches = [entry for entry in entries if entry["name"] == name]
    if not matches:
        raise ValueError("Marketplace manifest is missing the declared plugin entry")
    if len(matches) != 1:
        raise ValueError("Marketplace manifest contains duplicate entries for the declared plugin")

    source = matches[0].get("source")
    if isinstance(source, dict) and source.get("source") == "local":
        source = source.get("path")
    if not isinstance(source, str) or not (source == "." or source.startswith("./")):
        raise ValueError("Marketplace plugin entry must specify a local './' path")

    relative = source.removeprefix("./")
    parts = PurePosixPath(relative).parts
    if relative.startswith("/") or any(char in relative for char in "\\:\0") or ".." in parts:
        raise ValueError("Marketplace plugin entry path must stay inside the bundle")
    return "/".join(parts) + "/" if parts else ""


def inspect_bundle(spec: Mapping, root: Path) -> dict:
    """Validate the bundle pin and the marketplace-selected plugin identity."""
    if not isinstance(spec, Mapping):
        raise ValueError("Bundle spec must be a mapping")
    spec = dict(spec)
    for field in ("name", "marketplace", "version"):
        value = spec.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"Invalid bundle spec {field}")
    if not isinstance(spec.get("enabled"), bool):
        raise ValueError("Invalid bundle spec enabled field")
    expected = spec.get("bundle_sha256")
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("Bundle spec bundle_sha256 must be a lowercase SHA-256 digest")

    canonical, hashes = _bundle_files(root)
    bundle_digest = _digest(hashes)
    if bundle_digest != expected:
        raise ValueError("Bundle SHA-256 does not match bundle_sha256")

    marketplace = _read_manifest(canonical, hashes, _MARKETPLACE_MANIFEST, "marketplace")
    if marketplace.get("name") != spec["marketplace"]:
        raise ValueError("Marketplace manifest name does not match the bundle spec")
    prefix = _plugin_prefix(marketplace, spec["name"])
    plugin = _read_manifest(canonical, hashes, prefix + _PLUGIN_MANIFEST, "plugin")
    for field in ("name", "version"):
        if plugin.get(field) != spec[field]:
            raise ValueError(f"Plugin manifest {field} does not match the bundle spec")

    content_digest = bundle_digest
    if prefix:
        content_digest = _digest({
            path[len(prefix):]: file_digest for path, file_digest in hashes.items() if path.startswith(prefix)
        })
    return {**spec, "source": str(canonical), "source_type": "local", "content_sha256": content_digest}
