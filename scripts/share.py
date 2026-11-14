from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

import tomlkit

from registry import declaration_hash, normalize_mcp, normalize_plugin, parse_registry
import mcp_packages

REPOSITORY = "tttaliesin/personal-harness"
API = f"repos/{REPOSITORY}"
UNSUPPORTED = "Source is private, ambiguous, or unsupported."
IDENTIFIER = r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}"


class ShareError(Exception):
    pass


class MissingPluginManifest(ValueError):
    pass


@dataclass(frozen=True)
class Ready:
    id: str
    declaration: dict
    local_settings: bool = False


@dataclass(frozen=True)
class Blocked:
    id: str
    reason: str = UNSUPPORTED


@dataclass(frozen=True)
class Resolvable:
    id: str
    source: str
    ref: str


Candidate = Ready | Blocked | Resolvable


def read_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise ValueError("Invalid metadata")
    return value


def github_source(source: str) -> str:
    if not isinstance(source, str) or not re.fullmatch(
            r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?/?", source):
        raise ValueError("Unsupported source")
    normalized = source.rstrip("/").removesuffix(".git")
    if any(part.startswith(".") for part in normalized.split("/")[3:]):
        raise ValueError("Unsupported source")
    return normalized + ".git"


def plugin_source(market: str, config: dict) -> tuple[str, str]:
    metadata = config.get("marketplaces", {}).get(market, {})
    if metadata.get("source_type") != "git":
        raise ValueError("Unsupported source")
    source = github_source(metadata.get("source"))
    ref = metadata.get("ref")
    if not isinstance(ref, str) or not re.fullmatch(r"[0-9a-f]{40}", ref):
        raise ValueError("Unpinned source")
    return source, ref


def marketplace_manifest(metadata: dict, name: str, market: str) -> str:
    if metadata.get("name") != market:
        raise ValueError("Marketplace identity differs")
    entries = [entry for entry in metadata.get("plugins", []) if entry.get("name") == name]
    if len(entries) != 1:
        raise ValueError("Missing unique marketplace entry")
    source = entries[0].get("source")
    if isinstance(source, dict) and source.get("source") == "local":
        source = source.get("path")
    if not isinstance(source, str) or not (source.startswith("./") or source == "."):
        raise ValueError("Unsupported marketplace entry source")
    prefix = source.removeprefix("./").rstrip("/")
    if prefix == ".":
        prefix = ""
    return f"{prefix}/.codex-plugin/plugin.json" if prefix else ".codex-plugin/plugin.json"


def plugin_candidate(name: str, market: str, config: dict, lock: dict, home: Path) -> dict:
    source, ref = plugin_source(market, config)
    records = [p for p in lock.get("plugins", []) if p.get("name") == name and p.get("marketplace") == market]
    roots = home / "plugins" / "cache" / market / name
    matches = []
    for manifest in roots.glob("*/.codex-plugin/plugin.json"):
        identity = read_json(manifest)
        if identity.get("name") != name or identity.get("version") != manifest.parents[1].name:
            continue
        relative = None
        declaration = None
        if len(records) == 1:
            record = records[0]
            if (github_source(record.get("source")) == source and record.get("ref") == ref
                    and record.get("version") == identity.get("version")):
                relative = record.get("manifest")
                declaration = record.get("declaration")
                if declaration is None:
                    registered = [p for p in lock.get("registrations", {}).get("plugins", [])
                                  if p.get("name") == name and p.get("marketplace") == market]
                    declaration = registered[0] if len(registered) == 1 else None
                if declaration is not None:
                    declaration = normalize_plugin(declaration)
                    if (declaration["name"] != name or declaration["marketplace"] != market
                            or declaration["source"] != source or declaration["manifest"] != relative
                            or declaration["enabled"] is not True
                            or ("declaration_sha256" in record and record["declaration_sha256"] != declaration_hash(declaration))
                            or (declaration["channel"] == "git-ref" and re.fullmatch(r"[0-9a-f]{40}", declaration["ref"])
                                and declaration["ref"] != ref)):
                        raise ValueError("Mismatched managed declaration")
        if relative is None:
            for file in (".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"):
                path = manifest.parents[1] / file
                if not path.is_file():
                    continue
                try:
                    relative = marketplace_manifest(read_json(path), name, market)
                except ValueError:
                    continue
        if relative:
            matches.append(declaration or normalize_plugin(dict(name=name, marketplace=market, source=source,
                channel="git-ref", ref=ref, manifest=relative, enabled=True)))
    if not matches:
        raise MissingPluginManifest("Missing manifest evidence")
    if any(item != matches[0] for item in matches):
        raise ValueError("Missing manifest evidence")
    return matches[0]


def resolve_plugin(candidate: Resolvable) -> Ready:
    name, market = candidate.id.removeprefix("plugin:").split("@")
    coordinates = candidate.source.removeprefix("https://github.com/").removesuffix(".git")
    for path in (".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"):
        endpoint = f"https://raw.githubusercontent.com/{coordinates}/{candidate.ref}/{path}"
        try:
            with urllib.request.urlopen(endpoint, timeout=20) as response:
                manifest = marketplace_manifest(json.load(response), name, market)
            return Ready(candidate.id, normalize_plugin(dict(name=name, marketplace=market, source=candidate.source,
                channel="git-ref", ref=candidate.ref, manifest=manifest, enabled=True)))
        except urllib.error.HTTPError as error:
            error.close()
            if error.code != 404:
                raise ShareError("Selected plugin marketplace could not be verified as public on GitHub.") from None
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            raise ShareError("Selected plugin marketplace could not be verified as public on GitHub.") from None
    raise ShareError("Selected plugin marketplace could not be verified as public on GitHub.")


def package_metadata(command: str, args: list[str], home: Path) -> dict:
    if not isinstance(command, str) or not isinstance(args, list) or not all(isinstance(arg, str) for arg in args):
        raise ValueError("Invalid launcher")
    executable = Path(command).name.lower().removesuffix(".exe").removesuffix(".cmd")
    if executable == "uvx":
        tokens = list(args)
        if tokens and tokens[0] == "--from" and len(tokens) >= 3:
            package, entrypoint = tokens[1:3]
        elif tokens and not tokens[0].startswith("-"):
            package = tokens[0]
            entrypoint = re.split(r"==", package)[0]
        else:
            raise ValueError("Unsupported Python launcher")
        pieces = package.split("==")
        if len(pieces) > 2:
            raise ValueError("Unsupported Python package")
        return dict(kind="python", package=pieces[0], entrypoint=entrypoint,
                    version=pieces[1] if len(pieces) == 2 else "latest")
    manifests = []
    requested = None
    if executable == "npx":
        tokens = list(args)
        if tokens and tokens[0] in ("-y", "--yes"):
            tokens.pop(0)
        if not tokens or tokens[0].startswith("-"):
            raise ValueError("Unsupported npm launcher")
        requested = tokens[0]
        match = re.fullmatch(r"((?:@[a-z0-9_.-]+/)?[a-z0-9_.-]+)(?:@([0-9][0-9A-Za-z.+-]*))?", requested)
        if not match:
            raise ValueError("Unsupported npm package")
        package, version = match.groups()
        caches = [home / "AppData/Local/npm-cache", home / ".npm"]
        if os.environ.get("npm_config_cache"):
            caches.insert(0, Path(os.environ["npm_config_cache"]))
        for root in (cache / "_npx" for cache in dict.fromkeys(caches)):
            for cache in root.glob("*"):
                path = cache / "node_modules" / package / "package.json"
                if path.is_file():
                    manifests.append(path)
    elif executable in ("node", "nodejs") and args:
        script = Path(args[0])
        if not script.is_absolute():
            raise ValueError("Unknown script")
        manifests = [parent / "package.json" for parent in script.parents if (parent / "package.json").is_file()][:1]
    else:
        launcher = Path(command)
        if launcher.is_absolute():
            manifests = [parent / "package.json" for parent in launcher.parents if (parent / "package.json").is_file()][:1]
    found = []
    for path in manifests:
        metadata = read_json(path)
        installed_package = metadata.get("name", "")
        root = next((parent.parent for parent in path.parents if parent.name == "node_modules"), None)
        if root is not None:
            package_lock = read_json(root / "package-lock.json")
            provenance = package_lock.get("packages", {}).get(f"node_modules/{installed_package}", {})
            resolved = urllib.parse.urlsplit(provenance.get("resolved", ""))
            if (resolved.scheme != "https" or resolved.netloc != "registry.npmjs.org"
                    or resolved.query or resolved.fragment or provenance.get("version") != metadata.get("version")
                    or not provenance.get("integrity")):
                continue
        else:
            continue
        if requested and (metadata.get("name") != package or (version and metadata.get("version") != version)):
            continue
        bins = metadata.get("bin", {})
        if isinstance(bins, str):
            bins = {metadata["name"].split("/")[-1]: bins}
        if not isinstance(bins, dict):
            continue
        if requested:
            default = metadata["name"].split("/")[-1]
            entry = default if default in bins else next(iter(bins)) if len(bins) == 1 else None
        else:
            target = Path(args[0] if executable in ("node", "nodejs") else command).resolve()
            entries = [key for key, value in bins.items() if isinstance(value, str)
                       and (path.parent / value).resolve() == target]
            entry = entries[0] if len(entries) == 1 else None
        if entry:
            found.append(dict(kind="npm", package=metadata["name"], version=version if requested and version else "latest", entrypoint=entry))
    if not found or any(item != found[0] for item in found):
        raise ValueError("Missing package identity")
    return found[0]


def mcp_candidate(name: str, settings: dict, lock: dict, home: Path, state_root: Path) -> dict:
    if name.lower() in {"node_repl", "codegraph"}:
        raise ValueError("Reserved runtime")
    if "url" in settings:
        spec = dict(name=name, kind="http", url=settings["url"])
        if "bearer_token_env_var" in settings:
            spec["bearer_token_env_var"] = settings["bearer_token_env_var"]
        spec = normalize_mcp(spec)
        url = urllib.parse.urlsplit(spec["url"])
        host = url.hostname.encode("idna").decode("ascii").rstrip(".").lower()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            try:
                address = ipaddress.IPv4Address(socket.inet_aton(host))
            except OSError:
                address = None
        if address is not None:
            if not address.is_global:
                raise ValueError("Endpoint requires private configuration")
            host = str(address)
        elif ("." not in host or host.endswith((".localhost", ".local", ".internal", ".lan", ".home", ".corp"))):
            raise ValueError("Endpoint requires private configuration")
        if url.query or url.fragment or url.path not in ("", "/", "/mcp", "/mcp/", "/sse", "/sse/"):
            raise ValueError("Endpoint requires private configuration")
        netloc = f"[{host}]" if ":" in host else host
        if url.port and url.port != 443:
            netloc += f":{url.port}"
        return normalize_mcp({**spec, "url": url._replace(netloc=netloc).geturl()})
    records = [p for p in lock.get("mcp", []) if p.get("name") == name]
    if len(records) == 1 and "declaration" in records[0]:
        record = records[0]
        spec = normalize_mcp(record["declaration"])
        if (spec["kind"] != "http" and spec["name"] == name and record.get("kind") == spec["kind"]
                and record.get("declaration_sha256") == declaration_hash(spec)):
            command = settings.get("command", "")
            if spec["kind"] == "npm" and Path(command).name.lower().removesuffix(".exe") != "node":
                raise ValueError("Unknown interpreter")
            expected = mcp_packages.configuration(record, state_root, node=command)
            launch = expected["args"][:-len(spec["args"])] if spec["args"] else expected["args"]
            if command == expected["command"] and settings.get("args", [])[:len(launch)] == launch:
                return {**spec, "args": []}
    spec = dict(name=name, **package_metadata(settings.get("command", ""), settings.get("args", []), home))
    spec["env_vars"] = sorted(set(settings.get("env_vars", [])) | set(settings.get("env", {})))
    return normalize_mcp(spec)


def discover(codex_home: Path, state_root: Path, user_home: Path | None = None) -> list[Candidate]:
    config_path = codex_home / "config.toml"
    config = tomlkit.parse(config_path.read_text(encoding="utf-8-sig")).unwrap() if config_path.exists() else {}
    lock_path = state_root / "sources/dependencies.lock.json"
    lock = read_json(lock_path) if lock_path.exists() else {}
    result = []
    for identity, settings in config.get("plugins", {}).items():
        if not isinstance(settings, dict) or settings.get("enabled") is not True:
            continue
        pieces = identity.split("@")
        if len(pieces) != 2 or not all(re.fullmatch(IDENTIFIER, part) for part in pieces):
            result.append(Blocked("plugin:unsupported"))
            continue
        name, market = pieces
        label = f"plugin:{name}@{market}"
        try:
            result.append(Ready(label, plugin_candidate(name, market, config, lock, codex_home)))
        except MissingPluginManifest:
            source, ref = plugin_source(market, config)
            result.append(Resolvable(label, source, ref))
        except (ValueError, OSError, KeyError, TypeError, AttributeError):
            result.append(Blocked(label))
    for name, settings in config.get("mcp_servers", {}).items():
        if not re.fullmatch(IDENTIFIER, name):
            result.append(Blocked("mcp:unsupported"))
            continue
        label = f"mcp:{name}"
        try:
            spec = mcp_candidate(name, settings, lock, user_home or codex_home.parent, state_root)
            result.append(Ready(label, spec, spec["kind"] != "http" or bool(
                settings.get("http_headers") or settings.get("env_http_headers"))))
        except (ValueError, OSError, KeyError, TypeError, AttributeError):
            result.append(Blocked(label))
    return sorted(result, key=lambda item: item.id)


def merge_registry(text: str, selected: list[Ready]) -> str:
    before = parse_registry(text)
    doc = tomlkit.parse(text)
    for candidate in selected:
        group = "plugins" if candidate.id.startswith("plugin:") else "mcp"
        spec = candidate.declaration
        normalize = normalize_plugin if group == "plugins" else normalize_mcp
        identity = lambda item: (item.get("marketplace", "").casefold(), item["name"].casefold())
        entries = doc.get(group)
        if entries is None:
            entries = tomlkit.aot()
            doc[group] = entries
        match = next((item for item in entries if identity(item) == identity(spec)), None)
        if group == "mcp" and spec["kind"] != "http":
            spec = {**spec, "args": normalize_mcp(match).get("args", []) if match is not None else []}
        if match is None:
            table = tomlkit.table()
            table.update(spec)
            entries.append(table)
        elif normalize(match) != spec:
            for key in list(match):
                if key not in spec:
                    del match[key]
            match.update(spec)
    rendered = tomlkit.dumps(doc)
    after = parse_registry(rendered)
    return text if before.fingerprint == after.fingerprint else rendered


def gh_api(endpoint: str, *, payload: dict | None = None) -> dict:
    command = ["gh", "api", "--hostname", "github.com", "--method", "PUT" if payload is not None else "GET", endpoint]
    if payload is not None:
        command += ["--input", "-"]
    environment = {key: value for key, value in os.environ.items() if key not in {"GH_DEBUG", "GH_HOST", "GH_REPO"}}
    try:
        completed = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
            capture_output=True, text=True, encoding="utf-8", env=environment, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        raise ShareError("GitHub request failed. Check the remote registry before trying again.") from None
    if completed.returncode:
        diagnostics = completed.stderr + completed.stdout
        if re.search(r"\b(?:409|422)\b", diagnostics):
            raise ShareError("Registry changed or the write conflicted. Review it and run share again.")
        if re.search(r"\b(?:401|403)\b", diagnostics):
            raise ShareError("GitHub access denied. Check gh authentication and repository write permission.")
        raise ShareError("GitHub request failed. Check the remote registry before trying again.")
    try:
        value = json.loads(completed.stdout)
        if not isinstance(value, dict):
            raise ValueError
        return value
    except ValueError:
        raise ShareError("GitHub response was lost or invalid. Check the remote registry before trying again.") from None


class ArtifactRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Package artifact redirects are unsupported")


def verify_python_entrypoint(spec: dict, metadata: dict) -> None:
    from pip._vendor.packaging.specifiers import SpecifierSet
    from pip._vendor.packaging.tags import sys_tags
    from pip._vendor.packaging.utils import parse_wheel_filename
    from pip._vendor.packaging.version import Version

    version = Version(metadata["info"]["version"])
    if spec["version"] != "latest" and version != Version(spec["version"]):
        raise ValueError("Public Python version differs from selection")
    tags = set(sys_tags())
    python_version = Version(".".join(map(str, sys.version_info[:3])))
    for artifact in metadata.get("urls", []):
        if artifact.get("packagetype") != "bdist_wheel" or (artifact.get("yanked") and spec["version"] == "latest"):
            continue
        filename = artifact["filename"]
        name, wheel_version, _, wheel_tags = parse_wheel_filename(filename)
        if (name != spec["package"] or wheel_version != version or not tags.intersection(wheel_tags)
                or python_version not in SpecifierSet(artifact.get("requires_python") or "")):
            continue
        url = urllib.parse.urlsplit(artifact["url"])
        if (url.scheme != "https" or url.netloc != "files.pythonhosted.org" or url.query or url.fragment
                or "\\" in artifact["url"] or any(char.isspace() for char in artifact["url"])
                or urllib.parse.unquote(url.path.rsplit("/", 1)[-1]) != filename):
            raise ValueError("Unsupported public Python artifact URL")
        expected = artifact.get("digests", {}).get("sha256", "")
        if not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise ValueError("Public Python artifact lacks SHA256")
        with urllib.request.build_opener(ArtifactRedirect()).open(artifact["url"], timeout=20) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError("Public Python artifact SHA256 differs")
        identity, entries = mcp_packages._wheel(data, filename, {"tags": [str(tag) for tag in tags]})
        if (re.sub(r"[-_.]+", "-", identity["name"]).lower() != spec["package"] or Version(identity["version"]) != version
                or python_version not in SpecifierSet(identity["requires_python"])
                or not re.fullmatch(r"[\w.]+\s*:\s*[\w.]+(?:\s*\[[\w., -]+\])?", entries.get(spec["entrypoint"], ""))):
            raise ValueError("Public Python wheel does not prove selected console script")
        return
    raise ValueError("No compatible public Python wheel proves selected console script")


def verify_public_plugins(selected: list[Ready]) -> None:
    for candidate in selected:
        spec = candidate.declaration
        if not candidate.id.startswith("plugin:"):
            if spec["kind"] == "http":
                continue
            package = urllib.parse.quote(spec["package"], safe="")
            version = spec["version"]
            if spec["kind"] == "npm":
                endpoint = f"https://registry.npmjs.org/{package}/{version}"
            else:
                suffix = "" if version == "latest" else f"/{version}"
                endpoint = f"https://pypi.org/pypi/{package}{suffix}/json"
            try:
                with urllib.request.urlopen(endpoint, timeout=20) as response:
                    metadata = json.load(response)
                name = metadata.get("name") if spec["kind"] == "npm" else metadata.get("info", {}).get("name", "")
                if spec["kind"] == "python":
                    name = re.sub(r"[-_.]+", "-", name).lower()
                if name != spec["package"]:
                    raise ValueError
                if spec["kind"] == "npm":
                    if not metadata.get("version") or (version != "latest" and metadata["version"] != version):
                        raise ValueError
                    mcp_packages._npm_bin(metadata, spec["entrypoint"])
                else:
                    verify_python_entrypoint(spec, metadata)
            except (OSError, ValueError, KeyError, TypeError, AttributeError):
                raise ShareError("Selected package could not be verified through its public package registry.") from None
            continue
        source = github_source(candidate.declaration["source"])
        coordinates = source.removeprefix("https://github.com/").removesuffix(".git")
        request = urllib.request.Request(f"https://api.github.com/repos/{coordinates}",
            headers={"User-Agent": "personal-harness-share", "Accept": "application/vnd.github+json"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                metadata = json.load(response)
            if metadata.get("private") is not False or metadata.get("full_name", "").lower() != coordinates.lower():
                raise ValueError
            manifest_url = f"https://raw.githubusercontent.com/{coordinates}/{urllib.parse.quote(spec.get('ref', 'HEAD'), safe='')}/{spec['manifest']}"
            with urllib.request.urlopen(manifest_url, timeout=20) as response:
                manifest = json.load(response)
            if manifest.get("name") != spec["name"]:
                raise ValueError
        except (OSError, ValueError, AttributeError):
            raise ShareError("Selected plugin source could not be verified as public on GitHub.") from None


def main(argv=None) -> int:
    class Parser(argparse.ArgumentParser):
        def error(self, message):
            self.exit(2, "Invalid share options. Use --help for supported options.\n")

    parser = Parser(description="Share installed portable registrations. Private launch settings stay local.")
    parser.add_argument("--home", type=Path, default=Path.home())
    parser.add_argument("--codex-home", type=Path)
    parser.add_argument("--state-root", type=Path, default=Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share")) / "PersonalHarness/state")
    parser.add_argument("--select", help="Comma-separated plugin:name@marketplace or mcp:name IDs")
    parser.add_argument("--list", action="store_true", help="List local candidates without GitHub access")
    parser.add_argument("--dry-run", action="store_true", help="Preview without publishing")
    parser.add_argument("--yes", action="store_true", help="Publish an explicit selection after printing its preview")
    parser.add_argument("--branch", default="main")
    args = parser.parse_args(argv)
    writing = False
    try:
        if (not args.branch or args.branch.startswith("-") or any(ord(char) < 32 for char in args.branch)):
            raise ShareError("Invalid branch.")
        if args.yes and not args.select:
            raise ShareError("--yes requires --select with explicit IDs.")
        codex_home = args.codex_home or Path(os.environ.get("CODEX_HOME", args.home / ".codex"))
        candidates = discover(codex_home, args.state_root, args.home)
        if args.list or not args.select:
            for index, candidate in enumerate(candidates, 1):
                status = ("Ready" if isinstance(candidate, Ready) else "Resolvable through public Git metadata"
                          if isinstance(candidate, Resolvable) else f"Blocked. {candidate.reason}")
                print(f"{index}. {candidate.id}: {status}")
        if args.list:
            return 0
        selection = args.select
        if selection is None:
            if not sys.stdin.isatty():
                raise ShareError("Use --select for noninteractive selection. Publishing also requires --yes.")
            numbers = input("Select comma-separated row numbers, or press Enter to cancel: ").strip()
            rows = [part.strip() for part in numbers.split(",")] if numbers else []
            if any(not part.isascii() or not part.isdigit() or not 1 <= int(part) <= len(candidates) for part in rows):
                raise ShareError("Selection contains an invalid row number.")
            selection = ",".join(candidates[int(part) - 1].id for part in rows)
        if not selection:
            print("Cancelled.")
            return 0
        ids = [item.strip() for item in selection.split(",")]
        available = {item.id: item for item in candidates if isinstance(item, (Ready, Resolvable))}
        if len(set(ids)) != len(ids) or any(item not in available for item in ids):
            raise ShareError("Selection contains an unknown, duplicate, or blocked ID.")
        selected = [resolve_plugin(available[item]) if isinstance(available[item], Resolvable) else available[item] for item in ids]
        verify_public_plugins(selected)
        permission = gh_api(API)
        if permission.get("permissions", {}).get("push") is not True:
            raise ShareError("Repository write permission is required.")
        endpoint = f"{API}/contents/registry.toml"
        remote = gh_api(endpoint + "?ref=" + urllib.parse.quote(args.branch, safe=""))
        sha = remote.get("sha")
        if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha) or remote.get("encoding") != "base64":
            raise ShareError("Invalid remote registry response.")
        text = base64.b64decode(remote["content"]).decode("utf-8-sig")
        merged = merge_registry(text, selected)
        public = parse_registry(merged)
        selected_ids = {candidate.id.casefold() for candidate in selected}
        print("Public declarations for tttaliesin/personal-harness registry.toml:")
        print(tomlkit.dumps({"schema_version": 1,
            "plugins": [spec for spec in public.plugins if f"plugin:{spec['name']}@{spec['marketplace']}".casefold() in selected_ids],
            "mcp": [spec for spec in public.mcp if f"mcp:{spec['name']}".casefold() in selected_ids]}))
        if any(candidate.local_settings for candidate in selected):
            print("Per-PC local settings required. Application args, working directories, and header values stay local.")
        if merged == text:
            print("Unchanged. No commit created.")
            return 0
        if args.dry_run:
            print("Dry run. Nothing published.")
            return 0
        if not args.yes:
            if not sys.stdin.isatty():
                raise ShareError("Publishing noninteractively requires --select and --yes.")
            if input("Publish these public declarations? [y/N] ").strip().lower() != "y":
                print("Cancelled.")
                return 0
        writing = True
        result = gh_api(endpoint, payload={"message": "Share selected portable registrations", "branch": args.branch,
            "sha": sha, "content": base64.b64encode(merged.encode("utf-8")).decode("ascii")})
        url = result.get("commit", {}).get("html_url", "")
        if not re.fullmatch(r"https://github\.com/tttaliesin/personal-harness/commit/[0-9a-f]{40}", url):
            raise ShareError("Publication response was invalid. Check the remote registry before trying again.")
        print(f"Published {url}")
        return 0
    except (EOFError, KeyboardInterrupt):
        if writing:
            print("Publication was interrupted. Check the remote registry before trying again.", file=sys.stderr)
            return 1
        print("Cancelled.")
        return 0
    except ShareError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (ValueError, OSError, KeyError, TypeError, AttributeError, tomlkit.exceptions.TOMLKitError):
        print("Invalid local metadata or registry. No further request was attempted.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
