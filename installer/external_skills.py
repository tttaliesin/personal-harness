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


def load_cache(path: Path, specs: tuple[dict, ...]) -> dict[str, tuple[str, dict[str, bytes]]]:
    try:
        raw = json.loads(path.read_bytes())
    except FileNotFoundError:
        raise ValueError("External skill cache is missing. Run ordinary install or update.") from None
    except (UnicodeError, ValueError):
        raise ValueError("Invalid external skill cache. Run ordinary install or update.") from None
    if (not isinstance(raw, Mapping) or type(raw.get("schema_version")) is not int
            or raw["schema_version"] != 1 or not isinstance(raw.get("skills"), Mapping)):
        raise ValueError("Invalid external skill cache. Run ordinary install or update.")

    result = {}
    for spec in specs:
        name = spec["name"]
        record = raw["skills"].get(name)
        if not isinstance(record, Mapping) or record.get("declaration_sha256") != declaration_hash(spec):
            raise ValueError(f"External skill cache does not match {name}. Run ordinary install or update.")
        revision, files = record.get("revision"), record.get("files")
        if (not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision)
                or not isinstance(files, Mapping) or not files
                or record.get("content_sha256") != declaration_hash(files)
                or (spec.get("role") == "upstream" and "SKILL.md" not in files)):
            raise ValueError(f"Invalid external skill payload for {name}. Run ordinary install or update.")
        try:
            decoded = {validate_skill_file_path(relative): base64.b64decode(data, validate=True)
                       for relative, data in files.items()}
            if len({relative.casefold() for relative in decoded}) != len(decoded):
                raise ValueError("Case-conflicting filenames")
        except (TypeError, ValueError):
            raise ValueError(f"Invalid external skill payload for {name}. Run ordinary install or update.") from None
        result[name] = revision, decoded
    return result
