from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
import hashlib
import ipaddress
import json
from pathlib import Path, PurePosixPath
import re
import urllib.parse

import tomlkit


@dataclass(frozen=True)
class Registry:
    plugins: tuple[dict, ...]
    mcp: tuple[dict, ...]
    fingerprint: str


def declaration_hash(spec: Mapping) -> str:
    encoded = json.dumps(dict(spec), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _fields(spec: Mapping, allowed: set[str], required: set[str], context: str):
    if not isinstance(spec, Mapping) or set(spec) - allowed or required - set(spec):
        raise ValueError(f"Invalid {context} fields")


def _name(value, field: str) -> str:
    if (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", value)
            or value.endswith(".") or value.split(".")[0].upper() in {
                "CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
                *(f"LPT{i}" for i in range(1, 10))}):
        raise ValueError(f"Invalid {field}")
    return value


def _url(value, field: str, *, git: bool = False) -> str:
    if not isinstance(value, str) or any(char.isspace() or ord(char) < 32 for char in value):
        raise ValueError(f"Invalid {field}")
    try:
        url = urllib.parse.urlsplit(value)
        host = url.hostname
        port = url.port
        if (url.scheme != "https" or not host or url.username is not None or url.password is not None
                or url.fragment or (git and url.query) or "\\" in value):
            raise ValueError
        if host.lower() == "localhost" or host.lower().endswith((".localhost", ".local")):
            raise ValueError
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError
        for key, _ in urllib.parse.parse_qsl(url.query):
            if re.search(r"token|secret|password|api.?key|authorization|credential", key, re.I):
                raise ValueError
        netloc = host.lower() if ":" not in host else f"[{host.lower()}]"
        if port and port != 443:
            netloc += f":{port}"
        path = url.path.rstrip("/") if git else url.path
        if git:
            if not path or any(part in (".", "..") for part in path.split("/")):
                raise ValueError
            path = path.removesuffix(".git") + ".git"
        return urllib.parse.urlunsplit(("https", netloc, path, url.query, ""))
    except ValueError:
        raise ValueError(f"Invalid {field}; use a public HTTPS URL without credentials") from None


def _plugin(spec: Mapping) -> dict:
    _fields(spec, {"name", "marketplace", "source", "channel", "manifest", "enabled", "ref"},
            {"name", "marketplace", "source", "channel", "manifest"}, "plugin")
    normalized = {"name": _name(spec["name"], "plugin name"),
                  "marketplace": _name(spec["marketplace"], "marketplace name"),
                  "source": _url(spec["source"], "plugin source", git=True),
                  "channel": spec["channel"], "manifest": spec["manifest"],
                  "enabled": spec.get("enabled", True)}
    manifest = normalized["manifest"]
    if (not isinstance(manifest, str) or "\\" in manifest or ":" in manifest
            or any(part in ("", ".", "..") for part in manifest.split("/"))
            or PurePosixPath(manifest).is_absolute() or PurePosixPath(manifest).name != "plugin.json"):
        raise ValueError("Invalid plugin manifest path")
    for part in PurePosixPath(manifest).parts:
        if part != ".codex-plugin":
            _name(part, "plugin manifest path")
    if type(normalized["enabled"]) is not bool:
        raise ValueError("Invalid plugin enabled field")
    channel = normalized["channel"]
    if channel == "latest-release":
        source = urllib.parse.urlsplit(normalized["source"])
        if source.hostname != "github.com" or len(source.path.strip("/").split("/")) != 2 or "ref" in spec:
            raise ValueError("latest-release requires a GitHub repository and no ref")
    elif channel == "git-ref":
        ref = spec.get("ref")
        if (not isinstance(ref, str) or not ref or ref.startswith(("-", "/"))
                or any(char.isspace() or ord(char) < 32 for char in ref)
                or any(char in ref for char in ("~", "^", ":", "?", "*", "[", "\\"))
                or any(part in ref for part in ("..", "@{", "//")) or ref.endswith(("/", ".", ".lock"))):
            raise ValueError("Invalid plugin ref")
        normalized["ref"] = ref
    else:
        raise ValueError("Invalid plugin channel")
    return normalized


def _mcp(spec: Mapping) -> dict:
    if not isinstance(spec, Mapping):
        raise ValueError("Invalid MCP fields")
    kind = spec.get("kind")
    if kind not in ("npm", "python", "http"):
        raise ValueError("Invalid MCP kind")
    common = {"name", "kind"}
    allowed = common | ({"url", "bearer_token_env_var"} if kind == "http"
                        else {"package", "version", "entrypoint", "args", "env_vars"})
    required = common | ({"url"} if kind == "http" else {"package", "entrypoint"})
    _fields(spec, allowed, required, "MCP")
    name = _name(spec["name"], "MCP name")
    if name.lower() in {"node_repl", "codegraph"}:
        raise ValueError("Reserved runtime MCP name")
    result = {"name": name, "kind": kind}
    if kind == "http":
        result["url"] = _url(spec["url"], "MCP URL")
        if "bearer_token_env_var" in spec:
            result["bearer_token_env_var"] = _env_name(spec["bearer_token_env_var"])
        return result
    package = spec["package"]
    pattern = r"(?:@[a-z0-9][a-z0-9_.-]*/)?[a-z0-9][a-z0-9_.-]*" if kind == "npm" else r"[A-Za-z0-9][A-Za-z0-9_.-]*"
    if not isinstance(package, str) or not re.fullmatch(pattern, package):
        raise ValueError("Invalid MCP package")
    if kind == "python":
        package = re.sub(r"[-_.]+", "-", package).lower()
    version = spec.get("version", "latest")
    exact = r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?" if kind == "npm" else r"\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?(?:\+[a-zA-Z0-9.-]+)?"
    if not isinstance(version, str) or (version != "latest" and not re.fullmatch(exact, version)):
        raise ValueError("Invalid MCP version; use latest or an exact version")
    args = spec.get("args", [])
    env_vars = spec.get("env_vars", [])
    if not isinstance(args, list) or not all(isinstance(arg, str) for arg in args):
        raise ValueError("Invalid MCP args")
    credentials = r"^(?:--?(?:access[-_]?token|token|secret|password|api[-_]?key|authorization|credential)(?:=|$)|bearer\s|authorization:|x-api-key:)"
    for arg in args:
        value = arg.split("=", 1)[1] if arg.startswith("-") and "=" in arg else arg
        if (any(re.search(credentials, candidate, re.I) for candidate in (arg, value))
                or re.search(r"(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+", arg)
                or any(ord(char) < 32 for char in arg)
                or re.match(r"^(?:[A-Za-z]:[/\\]|/|\\\\|~[/\\]|file:)", value, re.I)):
            raise ValueError("MCP args contain credentials or local paths; use local configuration")
        if value.startswith(("http:", "https:")):
            _url(value, "MCP argument URL")
    if not isinstance(env_vars, list):
        raise ValueError("Invalid MCP env_vars")
    result.update(package=package, version=version, entrypoint=_name(spec["entrypoint"], "MCP entrypoint"),
                  args=list(args), env_vars=sorted({_env_name(value) for value in env_vars}))
    return result


def _env_name(value) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise ValueError("Invalid MCP environment variable name")
    return value


def load_registry(path: Path) -> Registry:
    try:
        raw = tomlkit.parse(path.read_text(encoding="utf-8-sig")).unwrap()
    except tomlkit.exceptions.TOMLKitError:
        raise ValueError("Invalid registry TOML") from None
    _fields(raw, {"schema_version", "plugins", "mcp"}, {"schema_version"}, "registry")
    if type(raw["schema_version"]) is not int or raw["schema_version"] != 1:
        raise ValueError("Unsupported registry schema_version")
    groups = {}
    for key, normalize, identity in (("plugins", _plugin, lambda p: (p["marketplace"], p["name"])),
                                     ("mcp", _mcp, lambda p: p["name"])):
        entries = raw.get(key, [])
        if not isinstance(entries, list):
            raise ValueError(f"Invalid registry {key} array")
        normalized = sorted((normalize(entry) for entry in entries), key=identity)
        identities = [identity(entry) for entry in normalized]
        folded = [tuple(part.casefold() for part in item) if isinstance(item, tuple) else item.casefold()
                  for item in identities]
        if len(set(folded)) != len(identities):
            raise ValueError(f"Duplicate registry {key} name")
        groups[key] = normalized
    marketplaces = {}
    for plugin in groups["plugins"]:
        policy = (plugin["marketplace"], plugin["source"], plugin["channel"], plugin.get("ref"))
        previous = marketplaces.setdefault(plugin["marketplace"].casefold(), policy)
        if previous != policy:
            raise ValueError(f"Conflicting marketplace selection policy for {plugin['marketplace']}")
    fingerprint = declaration_hash({"schema_version": 1, **groups})
    return Registry(tuple(groups["plugins"]), tuple(groups["mcp"]), fingerprint)


def lock_issues(registry: Registry, lock: Mapping) -> list[str]:
    issues = []
    version = lock.get("schema_version")
    desired = {"plugins": list(registry.plugins), "mcp": list(registry.mcp)}
    if type(version) is not int or version not in (1, 2):
        return ["Unsupported dependency lock schema_version; run ordinary update"]
    if version == 2:
        if lock.get("registry_sha256") != registry.fingerprint:
            issues.append("Registry fingerprint changed; run ordinary update")
        if lock.get("registrations") != desired:
            issues.append("Registry registrations changed; run ordinary update")
    marketplace_pins = {}
    for group, declarations in desired.items():
        entries = lock.get(group, [])
        if not isinstance(entries, list) or any(not isinstance(item, Mapping) for item in entries):
            issues.append(f"Invalid locked {group} records")
            continue
        identity = (lambda p: (p.get("marketplace"), p.get("name"))) if group == "plugins" else lambda p: p.get("name")
        if any(not isinstance(item.get("name"), str) or
               (group == "plugins" and not isinstance(item.get("marketplace"), str)) for item in entries):
            issues.append(f"Invalid locked {group} identity fields")
            continue
        records = {identity(item): item for item in entries}
        if len(records) != len(entries) or set(records) != {identity(item) for item in declarations}:
            issues.append(f"Locked {group} membership changed; run ordinary update")
        for spec in declarations:
            record = records.get(identity(spec))
            label = f"{group} {spec['name']}"
            if record is None:
                issues.append(f"Missing {label}; run ordinary update")
                continue
            if version == 2:
                if record.get("declaration") != spec or record.get("declaration_sha256") != declaration_hash(spec):
                    issues.append(f"Changed {label} declaration; run ordinary update")
            elif group == "mcp":
                issues.append(f"Missing {label} declaration evidence; run ordinary update")
            if group == "plugins":
                pin = (record.get("source"), record.get("ref"))
                if marketplace_pins.setdefault(spec["marketplace"], pin) != pin:
                    issues.append(f"Incoherent {label} marketplace exact ref")
                if any(record.get(key) != spec[key] for key in ("source", "name", "marketplace", "manifest")):
                    issues.append(f"Changed {label} source or manifest; run ordinary update")
                if not isinstance(record.get("ref"), str) or not re.fullmatch(r"[0-9a-f]{40}", record["ref"]):
                    issues.append(f"Invalid {label} exact ref")
                if (not isinstance(record.get("version"), str)
                        or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.+-]*", record["version"])
                        or record["version"].endswith(".")):
                    issues.append(f"Invalid {label} version")
                if not isinstance(record.get("content_sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", record["content_sha256"]):
                    issues.append(f"Invalid {label} content_sha256")
                if spec["channel"] == "git-ref":
                    if version == 1 and (not re.fullmatch(r"[0-9a-f]{40}", spec["ref"]) or record.get("ref") != spec["ref"]):
                        issues.append(f"Missing {label} ref selection evidence; run ordinary update")
                    elif re.fullmatch(r"[0-9a-f]{40}", spec["ref"]) and record.get("ref") != spec["ref"]:
                        issues.append(f"Changed {label} exact ref")
                elif (version == 1 and (not isinstance(record.get("version"), str)
                      or not re.fullmatch(r"\d+\.\d+\.\d+", record["version"])
                      or record.get("ref_basis") not in (f"Official stable release v{record.get('version')}",
                                                        f"Official stable release {record.get('version')}"))):
                    issues.append(f"Missing {label} stable release evidence; run ordinary update")
            elif record.get("kind") != spec["kind"]:
                issues.append(f"Changed {label} kind")
    return issues
