"""Manage portable Codex user settings without copying machine runtime state."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timezone

try:
    import tomlkit
except ImportError:
    raise SystemExit("Install the repository requirements first: python -m pip install -r requirements.txt")

REPO = Path(__file__).resolve().parents[1]
PROTECTED = {"notify", "model_catalog_json", "openai_base_url", "experimental_realtime_ws_base_url",
             "projects", "hooks", "model_providers", "computer_use"}
SKILLS = {"create-readme": "agents", "agent-desktop": "codex", "agent-desktop-windows": "codex"}


class HarnessError(Exception):
    pass


@dataclass(frozen=True)
class Layout:
    local: Path
    lock: Path
    seed_lock: Path
    sources: Path
    source_backups: Path
    persistent: bool


def select_layout(repo: Path, state_root: Path | None = None) -> Layout:
    repo = repo.resolve()
    local = state_root.resolve() if state_root is not None else repo / ".local"
    persistent = state_root is not None
    if persistent and (repo.is_relative_to(local) or
                       (local.is_relative_to(repo) and not local.is_relative_to(repo / ".local"))):
        raise HarnessError("State root must not overlap the source payload; a checkout's .local is supported")
    seed = repo / "sources/dependencies.lock.json"
    if persistent and local.name == ".local":
        adjacent = local.parent / "sources/dependencies.lock.json"
        if adjacent.is_file():
            seed = adjacent
    return Layout(local, local / "sources/dependencies.lock.json" if persistent else seed,
                  seed, local if persistent else repo, local / "source-backups", persistent)


def official_source_files(lock: Mapping) -> Mapping:
    expected = lock.get("agent_desktop", {}).get("files_sha256", {})
    required = {"sources/agent-desktop-LICENSE", "skills/agent-desktop/SKILL.md",
                "skills/agent-desktop-windows/SKILL.md"}
    if not required.issubset(expected):
        raise HarnessError("Locked agent-desktop source set is incomplete")
    for path in expected:
        if (".." in Path(path).parts or Path(path).is_absolute() or "\\" in path
                or (path != "sources/agent-desktop-LICENSE" and not path.startswith(
                    ("skills/agent-desktop/", "skills/agent-desktop-windows/")))):
            raise HarnessError(f"Unsafe managed source path: {path}")
    return expected


def validate_official_sources(root: Path, lock: Mapping) -> None:
    expected = official_source_files(lock)
    actual = set()
    for prefix in ("skills/agent-desktop", "skills/agent-desktop-windows"):
        directory = root / prefix
        safe_file(directory, root)
        for path in directory.rglob("*"):
            safe_file(path, root)
            if path.is_file():
                actual.add(path.relative_to(root).as_posix())
    license_path = root / "sources/agent-desktop-LICENSE"
    safe_file(license_path, root)
    if license_path.is_file():
        actual.add("sources/agent-desktop-LICENSE")
    if actual != set(expected):
        raise HarnessError("Official source cache file set does not match the selected lock; run scripts/install-dependencies.ps1")
    for path, sha256 in expected.items():
        if hashlib.sha256((root / path).read_bytes()).hexdigest() != sha256:
            raise HarnessError(f"Official source cache digest mismatch: {path}; run scripts/install-dependencies.ps1")


def read_toml(path: Path) -> dict:
    return tomlkit.parse(path.read_text(encoding="utf-8-sig"))


def validate_common(config: Mapping) -> None:
    forbidden = PROTECTED.intersection(config)
    if forbidden or "node_repl" in config.get("mcp_servers", {}) or "marketplaces" in config:
        raise HarnessError("common/config.toml contains machine/runtime settings; keep them in the existing config or a local override")
    def visit(value):
        if isinstance(value, Mapping):
            for item in value.values():
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, str) and (re.match(r"^[A-Za-z]:[/\\]", value) or value.startswith(("/", "\\\\", "${"))):
            raise HarnessError("Absolute PC paths do not belong in common/config.toml")
    visit(config)


def merge_into(target, overlay: Mapping, prefix: tuple = ()) -> None:
    """Merge leaves; identify skill selections by name/path instead of replacing the array."""
    for key, value in overlay.items():
        location = prefix + (key,)
        if isinstance(value, Mapping):
            if key not in target:
                target[key] = tomlkit.table()
            if not isinstance(target[key], Mapping):
                raise HarnessError(f"Expected a table at {'.'.join(location)}")
            merge_into(target[key], value, location)
        elif location == ("skills", "config"):
            current = target.get(key, tomlkit.aot())
            if not isinstance(current, list):
                raise HarnessError("skills.config must be an array")
            current = copy.deepcopy(current)
            for selection in value:
                identity = (selection.get("name"), selection.get("path"))
                if identity == (None, None):
                    raise HarnessError("Every skills.config entry needs a name or path")
                matches = [i for i, item in enumerate(current)
                           if all(item.get(k) == selection[k] for k in ("name", "path") if k in selection)]
                if len(matches) > 1:
                    raise HarnessError(f"Duplicate skill selection: {identity}")
                if matches:
                    merge_into(current[matches[0]], selection, location)
                else:
                    if isinstance(current, tomlkit.items.Array):
                        entry = tomlkit.inline_table()
                        for entry_key, entry_value in selection.items():
                            entry[entry_key] = copy.deepcopy(entry_value)
                        current.append(entry)
                    else:
                        current.append(copy.deepcopy(selection))
            target[key] = current
        else:
            target[key] = copy.deepcopy(value)


def merge_documents(current_text: str, common_text: str, host_text: str = "", local_text: str = "") -> str:
    current = tomlkit.parse(current_text)
    common = tomlkit.parse(common_text)
    validate_common(common)
    merge_into(current, common)
    for text in (host_text, local_text):
        if text.strip():
            merge_into(current, tomlkit.parse(text))
    rendered = tomlkit.dumps(current)
    tomlkit.parse(rendered)
    return rendered


def expand(value, variables: Mapping):
    if isinstance(value, Mapping):
        return {key: expand(item, variables) for key, item in value.items()}
    if isinstance(value, list):
        return [expand(item, variables) for item in value]
    if isinstance(value, str):
        for key, replacement in variables.items():
            value = value.replace("${" + key + "}", replacement)
        if "${" in value:
            raise HarnessError(f"Unknown path placeholder: {value}")
    return value


def safe_file(path: Path, root: Path) -> None:
    """Refuse managed files that would write through an existing link/junction."""
    if not path.is_relative_to(root):
        raise HarnessError(f"Target outside managed root: {path}")
    for item in (path, *path.parents):
        try:
            attributes = getattr(item.lstat(), "st_file_attributes", 0)
        except FileNotFoundError:
            attributes = 0
        if item.is_symlink() or attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
            raise HarnessError(f"Managed file would follow a link: {item}")
        if item == root:
            break


@dataclass
class FileChange:
    path: Path
    before: bytes | None
    after: bytes | None
    root: Path


@dataclass
class Plan:
    host: str
    user_home: Path
    codex_home: Path
    changes: list[FileChange] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    settings: list[str] = field(default_factory=list)

    def add(self, target: Path, data: bytes | None, root: Path):
        safe_file(target, root)
        if target.exists() and not target.is_file():
            raise HarnessError(f"Expected a file: {target}")
        before = target.read_bytes() if target.exists() else None
        if before != data:
            self.changes.append(FileChange(target, before, data, root))


def tool_path(name: str, paths: Mapping) -> str | None:
    configured = paths.get(name)
    if configured:
        return str(configured) if Path(configured).is_file() else shutil.which(configured)
    found = shutil.which(name.replace("_", "-"))
    if found:
        return found
    if name == "agent_desktop":
        fallback = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "agent-desktop" / "agent-desktop.exe"
        if fallback.is_file():
            return str(fallback)
    return None


def changed_settings(old: Mapping, new: Mapping, owned: Mapping, prefix: str = "") -> list[str]:
    result = []
    for key, expected in owned.items():
        label = prefix + key
        previous, current = old.get(key), new.get(key)
        if isinstance(expected, Mapping):
            result.extend(changed_settings(previous or {}, current or {}, expected, label + "."))
        elif previous != current:
            plain = current.unwrap() if hasattr(current, "unwrap") else current
            result.append(f"{label}: {plain!r}")
    return result


def previously_applied_files(codex_home: Path) -> dict[str, str]:
    root = codex_home / "harness-backups"
    safe_file(root, codex_home)
    files = {}
    for manifest in sorted(root.glob("*/manifest.json")):
        safe_file(manifest, codex_home)
        record = json.loads(manifest.read_text(encoding="utf-8"))
        if record.get("status", "applied") != "applied":
            continue
        for item in record.get("files", []):
            path = item["path"]
            if item.get("installed_sha256"):
                files[path] = item["installed_sha256"]
            else:
                files.pop(path, None)
    return files


def build_plan(repo: Path, host: str, user_home: Path, codex_home: Path | None = None,
               local_config: Path | None = None, state_root: Path | None = None) -> Plan:
    if host not in ("roylabs-desktop", "homelab-desktop"):
        raise HarnessError(f"Unknown host: {host}")
    repo = repo.resolve()
    layout = select_layout(repo, state_root)
    user_home = user_home.resolve()
    codex_home = (codex_home or user_home / ".codex").resolve()
    profile = read_toml(repo / "hosts" / f"{host}.toml")
    if profile.get("name") != host:
        raise HarnessError("Host profile name does not match its filename")
    local_config = (local_config or layout.local / f"{host}.toml").resolve()
    if layout.persistent and not local_config.is_relative_to(layout.local):
        raise HarnessError("local-config must be inside the selected state root")
    local = read_toml(local_config) if local_config.exists() else {}
    for source in (profile, local):
        if set(source) - {"name", "platform", "paths", "config"}:
            raise HarnessError("Host overrides support only name, platform, paths and config")
    variables = {"USERPROFILE": user_home.as_posix(), "CODEX_HOME": codex_home.as_posix(),
                 "REPO_ROOT": repo.as_posix(), "STATE_ROOT": layout.local.as_posix()}
    profile = expand(profile, variables)
    local = expand(local, variables)
    paths = {**profile.get("paths", {}), **local.get("paths", {})}
    for key, value in list(paths.items()):
        if "/" in value or "\\" in value:
            path = Path(value)
            paths[key] = str(path if path.is_absolute() else repo / path)
    plan = Plan(host, user_home, codex_home)
    common_path = repo / "common" / "config.toml"
    common = read_toml(common_path)
    validate_common(common)
    config_path = codex_home / "config.toml"
    original = config_path.read_text(encoding="utf-8-sig") if config_path.exists() else ""
    old = tomlkit.parse(original)
    if "node_repl" not in old.get("mcp_servers", {}):
        plan.missing.append("Local Codex runtime configuration is missing: open Codex on this PC first (node_repl)")
    merged = tomlkit.parse(original)
    merge_into(merged, common)
    merge_into(merged, profile.get("config", {}))
    merge_into(merged, local.get("config", {}))
    previous_codegraph = old.get("mcp_servers", {}).get("codegraph", {}).get("command")
    override_codegraph = (local.get("config", {}).get("mcp_servers", {}).get("codegraph", {}).get("command")
                          or profile.get("config", {}).get("mcp_servers", {}).get("codegraph", {}).get("command"))
    chosen_codegraph = override_codegraph or previous_codegraph
    if chosen_codegraph and "codegraph" not in paths:
        paths["codegraph"] = chosen_codegraph
        merged["mcp_servers"]["codegraph"]["command"] = chosen_codegraph
    codegraph = tool_path("codegraph", paths)
    if paths.get("codegraph") and codegraph:
        merged["mcp_servers"]["codegraph"]["command"] = codegraph
    if not codegraph:
        plan.missing.append("codegraph CLI: run scripts/install-dependencies.ps1 or set [paths].codegraph locally")
    agent_desktop = tool_path("agent_desktop", paths)
    if not agent_desktop:
        plan.missing.append("agent-desktop CLI: run scripts/install-dependencies.ps1 or set [paths].agent_desktop locally")
    lock_path = layout.lock
    official_ready = not layout.persistent
    if lock_path.exists():
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        if layout.persistent:
            try:
                validate_official_sources(layout.sources, lock)
                official_ready = True
            except HarnessError as exc:
                plan.missing.append(str(exc))
        for item in lock["plugins"]:
            cache = codex_home / "plugins" / "cache" / item["marketplace"] / item["name"] / item["version"]
            if not ((cache / ".codex-plugin" / "plugin.json").is_file() or (cache / "plugin.json").is_file()):
                plan.missing.append(f"Pinned plugin version is missing: {item['name']}@{item['version']}; run scripts/install-dependencies.ps1")
    elif layout.persistent:
        plan.missing.append(f"Persistent dependency lock is missing: {lock_path}; run scripts/install-dependencies.ps1")
    else:
        for selector in ("pstack@pstack-claude", "egm@egm"):
            plugin, marketplace = selector.split("@")
            cache = codex_home / "plugins" / "cache" / marketplace / plugin
            manifests = list(cache.glob("*/.codex-plugin/plugin.json")) + list(cache.glob("*/plugin.json"))
            if not manifests:
                plan.missing.append(f"Plugin not installed: {selector}; run scripts/install-dependencies.ps1")
    if not old.get("model_catalog_json"):
        plan.notes.append("No local model catalog configured; verify gpt-6.1-sol/max availability with your provider")
    rendered = tomlkit.dumps(merged)
    tomlkit.parse(rendered)
    plan.settings = changed_settings(old, merged, common)
    if rendered.replace("\r\n", "\n") != original.replace("\r\n", "\n"):
        plan.add(config_path, rendered.encode("utf-8"), codex_home)
    instructions = (repo / "common" / "AGENTS.md").read_text(encoding="utf-8")
    instructions = instructions.replace("${CODEX_HOME}", codex_home.as_posix())
    executables = [("agent-desktop", agent_desktop), ("codegraph", codegraph)]
    local_commands = [(name, path) for name, path in executables if path and ("/" in path or "\\" in path)]
    if local_commands:
        instructions += "\n## Local tool executables\n\nUse these executable locations for this PC when running the official CLI commands.\n"
        for name, path in local_commands:
            instructions += f"\n- `{name}`: `{Path(path).as_posix()}`\n"
    plan.add(codex_home / "AGENTS.md", instructions.encode("utf-8"), codex_home)
    if (codex_home / "AGENTS.override.md").exists():
        plan.missing.append("AGENTS.override.md shadows the shared AGENTS.md; reconcile the local override before applying")
    applied_files = previously_applied_files(codex_home)
    for skill, scope in SKILLS.items():
        if skill != "create-readme" and not official_ready:
            continue
        root = codex_home if scope == "codex" else user_home / ".agents"
        source = (repo if skill == "create-readme" else layout.sources) / "skills" / skill
        if not (source / "SKILL.md").is_file():
            raise HarnessError(f"Missing source skill: {skill}")
        destination_root = root / "skills" / skill
        safe_file(destination_root, root)
        source_files = {p.relative_to(source) for p in source.rglob("*") if p.is_file()}
        if destination_root.is_dir() and not destination_root.is_symlink():
            extra = [p for p in destination_root.rglob("*") if p.is_file() and p.relative_to(destination_root) not in source_files]
            unknown = []
            for path in extra:
                safe_file(path, root)
                if applied_files.get(str(path)) == hashlib.sha256(path.read_bytes()).hexdigest():
                    plan.add(path, None, root)
                else:
                    unknown.append(path)
            if unknown:
                plan.missing.append(f"Unmanaged files in {destination_root}: reconcile them before applying")
        for file in sorted(source.rglob("*")):
            if file.is_file():
                plan.add(root / "skills" / skill / file.relative_to(source), file.read_bytes(), root)
    return plan


def atomic_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=".harness-", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def apply_plan(plan: Plan) -> Path | None:
    if plan.missing:
        raise HarnessError("Prerequisites are missing; no changes were written")
    if not plan.changes:
        return None
    for change in plan.changes:
        safe_file(change.path, change.root)
        current = change.path.read_bytes() if change.path.exists() else None
        if current != change.before:
            raise HarnessError(f"File changed after planning: {change.path}")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    backup = plan.codex_home / "harness-backups" / stamp
    safe_file(backup, plan.codex_home)
    backup.mkdir(parents=True, exist_ok=False)
    records = []
    for index, change in enumerate(plan.changes):
        filename = f"{index:04}.bak" if change.before is not None else None
        if filename:
            (backup / filename).write_bytes(change.before)
        records.append({"path": str(change.path), "backup": filename,
                        "installed_sha256": hashlib.sha256(change.after).hexdigest() if change.after is not None else None})
    manifest = {"host": plan.host, "status": "pending", "files": records}
    manifest_path = backup / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    written = []
    try:
        for change in plan.changes:
            safe_file(change.path, change.root)
            current = change.path.read_bytes() if change.path.exists() else None
            if current != change.before:
                raise HarnessError(f"File changed during apply: {change.path}")
            if change.after is None:
                change.path.unlink()
            else:
                atomic_write(change.path, change.after)
            written.append(change)
        manifest["status"] = "applied"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    except Exception:
        for change in reversed(written):
            if change.before is None:
                change.path.unlink(missing_ok=True)
            else:
                atomic_write(change.path, change.before)
        raise
    return backup


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "apply", "check"))
    parser.add_argument("--host", default=os.environ.get("COMPUTERNAME", "").lower())
    parser.add_argument("--home", type=Path)
    parser.add_argument("--codex-home", type=Path)
    parser.add_argument("--local-config", type=Path)
    parser.add_argument("--state-root", type=Path)
    args = parser.parse_args(argv)
    try:
        codex_home = args.codex_home
        if codex_home is None and args.home is None and os.environ.get("CODEX_HOME"):
            codex_home = Path(os.environ["CODEX_HOME"])
        plan = build_plan(REPO, args.host.lower(), args.home or Path.home(), codex_home, args.local_config, args.state_root)
        print(f"Host: {plan.host}\nCodex home: {plan.codex_home}")
        for setting in plan.settings:
            print(f"SET {setting}")
        for change in plan.changes:
            action = "DELETE" if change.after is None else "UPDATE" if change.before is not None else "CREATE"
            print(f"{action} {change.path}")
        for item in plan.missing:
            print(f"MISSING {item}")
        for item in plan.notes:
            print(f"NOTE {item}")
        print(f"{len(plan.changes)} files, {len(plan.missing)} missing prerequisites")
        if args.command == "apply":
            backup = apply_plan(plan)
            print(f"Applied. Backup: {backup}" if backup else "Already up to date.")
        if args.command == "check":
            return 1 if plan.changes or plan.missing else 0
        return 2 if plan.missing else 0
    except (HarnessError, OSError, ValueError, tomlkit.exceptions.TOMLKitError) as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
