"""Encode and verify locally cached upstream skill payloads."""
from __future__ import annotations

import base64
from collections.abc import Mapping
import json
from pathlib import Path
import re

from registry import declaration_hash
from upstream_skill_sources import validate_skill_file_path


CACHE_NAME = "external-skills.json"


def encode_cache(specs: tuple[dict, ...], selected: dict[str, tuple[str, dict[str, bytes]]]) -> bytes:
    skills = {}
    for spec in specs:
        revision, payload = selected[spec["name"]]
        files = {path: base64.b64encode(data).decode("ascii") for path, data in payload.items()}
        skills[spec["name"]] = {
            "revision": revision,
            "declaration_sha256": declaration_hash(spec),
            "content_sha256": declaration_hash(files),
            "files": files,
        }
    return (json.dumps({"schema_version": 1, "skills": skills}, sort_keys=True) + "\n").encode("utf-8")


def _read_cache(path: Path) -> Mapping:
    try:
        raw = json.loads(path.read_bytes())
    except FileNotFoundError:
        raise ValueError("External skill cache is missing. Run ordinary install or update.") from None
    except (OSError, ValueError, RecursionError):
        raise ValueError("Invalid external skill cache. Run ordinary install or update.") from None
    if (not isinstance(raw, Mapping) or type(raw.get("schema_version")) is not int
            or raw["schema_version"] != 1 or not isinstance(raw.get("skills"), Mapping)):
        raise ValueError("Invalid external skill cache. Run ordinary install or update.")
    return raw["skills"]


def _load_record(record: object, spec: dict) -> tuple[str, dict[str, bytes]]:
    name = spec["name"]
    if not isinstance(record, Mapping) or record.get("declaration_sha256") != declaration_hash(spec):
        raise ValueError(f"External skill cache does not match {name}. Run ordinary install or update.")
    revision, files = record.get("revision"), record.get("files")
    try:
        if (not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision)
                or not isinstance(files, Mapping) or not files
                or record.get("content_sha256") != declaration_hash(files)
                or (spec.get("role") == "upstream" and "SKILL.md" not in files)):
            raise ValueError
        decoded = {validate_skill_file_path(relative): base64.b64decode(data, validate=True)
                   for relative, data in files.items()}
        if len({relative.casefold() for relative in decoded}) != len(decoded):
            raise ValueError
    except (TypeError, ValueError, RecursionError):
        raise ValueError(f"Invalid external skill payload for {name}. Run ordinary install or update.") from None
    return revision, decoded


def load_cache(path: Path, specs: tuple[dict, ...]) -> dict[str, tuple[str, dict[str, bytes]]]:
    """Load all requested records or raise an error for locked installs."""
    records = _read_cache(path)
    return {spec["name"]: _load_record(records.get(spec["name"]), spec) for spec in specs}


def load_available_cache(path: Path, specs: tuple[dict, ...]) -> tuple[dict[str, tuple[str, dict[str, bytes]]], list[str]]:
    """Load valid requested records and report unavailable cache data."""
    try:
        records = _read_cache(path)
    except ValueError as exc:
        return {}, [str(exc)]
    result = {}
    issues = []
    for spec in specs:
        name = spec["name"]
        try:
            result[name] = _load_record(records.get(name), spec)
        except ValueError as exc:
            issues.append(str(exc))
    return result, issues
