"""Resolve official stable dependencies in memory; pass --install to install and record them."""
from __future__ import annotations

import argparse
import copy
from dataclasses import dataclass, field
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
import urllib.request

import tomlkit
from harness import REPO, HarnessError, atomic_write, read_toml, safe_file, select_layout, official_source_files
import mcp_packages
from registry import Registry, declaration_hash, load_registry, lock_issues


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@dataclass
class Resolution:
    lock: dict
    files: dict[str, bytes] = field(default_factory=dict)
    archive: bytes | None = None


def fetch(url: str) -> bytes:
    if urllib.parse.urlsplit(url).scheme != "https":
        raise HarnessError(f"Expected HTTPS source: {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "personal-harness"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def github(repo: str, path: str) -> dict:
    return json.loads(fetch(f"https://api.github.com/repos/{repo}/{path}"))


def stable_version(value: str) -> str:
    version = value.removeprefix("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise HarnessError(f"Not a stable release version: {value}")
    return version


def release(repo: str) -> tuple[dict, str]:
    metadata = github(repo, "releases/latest")
    if metadata.get("draft") or metadata.get("prerelease"):
        raise HarnessError(f"Latest release is draft or prerelease: {repo}")
    stable_version(metadata["tag_name"])
    tag = urllib.parse.quote(metadata["tag_name"], safe="")
    obj = github(repo, f"git/ref/tags/{tag}")["object"]
    for _ in range(10):
        if obj["type"] == "commit" and re.fullmatch(r"[0-9a-f]{40}", obj["sha"]):
            return metadata, obj["sha"]
        if obj["type"] != "tag":
            break
        obj = github(repo, f"git/tags/{obj['sha']}")["object"]
    raise HarnessError(f"Cannot peel release tag to a commit: {repo}")


def source_tree(repo: str, commit: str) -> list[dict]:
    tree = github(repo, f"git/trees/{commit}?recursive=1")
    if tree.get("truncated"):
        raise HarnessError(f"Incomplete source tree: {repo}")
    return tree["tree"]


def content_digest(files: dict) -> str:
    return digest(json.dumps(files, sort_keys=True, separators=(",", ":")).encode())


def blob_digest(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def extract_agent(data: bytes, expected: str) -> bytes:
    if digest(data) != expected:
        raise HarnessError("agent-desktop archive SHA256 mismatch")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as package:
        members = [item for item in package.getmembers() if item.name == "agent-desktop.exe"]
        if len(members) != 1 or not members[0].isfile():
            raise HarnessError("agent-desktop release must contain one regular executable")
        with package.extractfile(members[0]) as stream:
            return stream.read()


def plugin_prefix(manifest: str) -> str:
    parent = Path(manifest).parent
    if parent.name == ".codex-plugin":
        parent = parent.parent
    return "" if parent.as_posix() == "." else parent.as_posix() + "/"


def git_output(arguments: list[str], *, cwd: Path | None = None) -> bytes:
    environment = os.environ.copy()
    environment["GIT_TERMINAL_PROMPT"] = "0"
    try:
        return subprocess.run(["git", *arguments], cwd=cwd, env=environment, check=True,
                              capture_output=True).stdout
    except subprocess.CalledProcessError:
        raise HarnessError("Plugin Git source resolution failed") from None


def resolve_plugins(declarations: tuple[dict, ...]) -> list[dict]:
    records = []
    groups = {}
    for spec in declarations:
        groups.setdefault(spec["marketplace"], []).append(spec)
    for group in groups.values():
        selection = group[0]
        if selection["channel"] == "latest-release":
            repo = urllib.parse.urlsplit(selection["source"]).path.strip("/").removesuffix(".git")
            metadata, commit = release(repo)
            version = stable_version(metadata["tag_name"])
            tree = source_tree(repo, commit)
            for spec in group:
                manifest = fetch(f"https://raw.githubusercontent.com/{repo}/{commit}/{spec['manifest']}")
                records.append(plugin_record(spec, commit, manifest, tree, version=version,
                                             basis=f"Official stable release {metadata['tag_name']}"))
        else:
            with tempfile.TemporaryDirectory(prefix="harness-plugin-") as directory:
                checkout = Path(directory)
                git_output(["init", "--quiet", str(checkout)])
                git_output(["remote", "add", "origin", selection["source"]], cwd=checkout)
                git_output(["fetch", "--quiet", "--depth=1", "origin", selection["ref"]], cwd=checkout)
                commit = git_output(["rev-parse", "FETCH_HEAD^{commit}"], cwd=checkout).decode().strip()
                if not re.fullmatch(r"[0-9a-f]{40}", commit):
                    raise HarnessError("Plugin Git source did not resolve to an exact commit")
                if re.fullmatch(r"[0-9a-f]{40}", selection["ref"]) and commit != selection["ref"]:
                    raise HarnessError("Plugin Git source resolved to a different commit")
                tree = []
                for entry in git_output(["ls-tree", "-rz", "--full-tree", commit], cwd=checkout).split(b"\0"):
                    if entry:
                        metadata, path = entry.split(b"\t", 1)
                        mode, kind, sha = metadata.decode("ascii").split()
                        tree.append({"path": path.decode("utf-8"), "mode": mode, "type": kind, "sha": sha})
                for spec in group:
                    manifest = git_output(["show", f"{commit}:{spec['manifest']}"], cwd=checkout)
                    records.append(plugin_record(spec, commit, manifest, tree, basis="Registry Git ref"))
    return records


def plugin_record(spec: dict, commit: str, data: bytes, tree: list[dict], *,
                  basis: str, version: str | None = None) -> dict:
    manifest = json.loads(data)
    if not isinstance(manifest, dict):
        raise HarnessError(f"Invalid plugin manifest for {spec['name']}")
    actual = manifest.get("version")
    if (manifest.get("name") != spec["name"] or not isinstance(actual, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.+-]*", actual)
            or actual.endswith(".")
            or (version is not None and actual != version)):
        raise HarnessError(f"Release/manifest disagreement for plugin {spec['name']}")
    prefix = plugin_prefix(spec["manifest"])
    files = {}
    for item in tree:
        path = item["path"]
        if path.startswith(prefix) and item["type"] != "tree":
            relative = path[len(prefix):]
            if (item["type"] != "blob" or item["mode"] not in ("100644", "100755")
                    or "\\" in relative or ":" in relative or relative.startswith("/")
                    or any(part in ("", ".", "..", ".git") for part in relative.split("/"))
                    or not re.fullmatch(r"[0-9a-f]{40}", item["sha"])):
                raise HarnessError(f"Unsupported plugin source entry for {spec['name']}")
            files[relative] = item["sha"]
    relative_manifest = spec["manifest"][len(prefix):]
    if relative_manifest not in files:
        raise HarnessError(f"Plugin manifest is absent from selected source tree for {spec['name']}")
    if files[relative_manifest] != blob_digest(data):
        raise HarnessError(f"Plugin manifest source digest mismatch for {spec['name']}")
    return {"name": spec["name"], "marketplace": spec["marketplace"], "manifest": spec["manifest"],
            "source": spec["source"], "ref": commit, "version": actual, "ref_basis": basis,
            "content_sha256": content_digest(files), "declaration": copy.deepcopy(spec),
            "declaration_sha256": declaration_hash(spec)}


def resolve(lock: dict, locked: bool = False, registry: Registry | None = None) -> Resolution:
    registry = registry if registry is not None else load_registry(REPO / "registry.toml")
    result = Resolution(copy.deepcopy(lock))
    candidate = result.lock
    candidate.pop("ego_lite", None)
    if locked:
        issues = lock_issues(registry, candidate)
        if issues:
            raise HarnessError("; ".join(issues))
        for group in ("plugins", "mcp"):
            specs = getattr(registry, group)
            for record in candidate.get(group, []):
                spec = next(item for item in specs if item["name"] == record["name"]
                            and (group != "plugins" or item["marketplace"] == record["marketplace"]))
                record.update(declaration=copy.deepcopy(spec), declaration_sha256=declaration_hash(spec))
        stamp_registry(candidate, registry)
        return result
    candidate["plugins"] = resolve_plugins(registry.plugins)
    candidate["mcp"] = [mcp_packages.resolve(spec) for spec in registry.mcp]
    stamp_registry(candidate, registry)
    graph = json.loads(fetch("https://registry.npmjs.org/@colbymchenry%2fcodegraph/latest"))
    integrity = graph["dist"]["integrity"]
    if graph.get("name") != "@colbymchenry/codegraph" or not integrity.startswith("sha512-"):
        raise HarnessError("Invalid CodeGraph registry metadata")
    candidate["codegraph"].update(version=stable_version(graph["version"]), integrity=integrity,
                                  tarball=graph["dist"]["tarball"])
    repo = "vercel-labs/agent-desktop"
    metadata, commit = release(repo)
    version = stable_version(metadata["tag_name"])
    name = f"agent-desktop-v{version}-x86_64-pc-windows-msvc.tar.gz"
    assets = [item for item in metadata["assets"] if item["name"] == name]
    if len(assets) != 1 or not re.fullmatch(r"sha256:[0-9a-f]{64}", assets[0].get("digest") or ""):
        raise HarnessError("Official agent-desktop asset with SHA256 digest is required")
    asset = assets[0]
    result.archive = fetch(asset["browser_download_url"])
    sha256 = asset["digest"].split(":", 1)[1]
    executable = extract_agent(result.archive, sha256)
    for item in source_tree(repo, commit):
        path = item["path"]
        if path == "LICENSE" or path.startswith(("skills/agent-desktop/", "skills/agent-desktop-windows/")):
            if item["type"] == "tree":
                continue
            if item["type"] != "blob" or item["mode"] not in ("100644", "100755"):
                raise HarnessError(f"Unsupported agent-desktop source entry: {path}")
            data = fetch(f"https://raw.githubusercontent.com/{repo}/{commit}/{path}")
            if blob_digest(data) != item["sha"]:
                raise HarnessError(f"Source blob digest mismatch: {path}")
            target = "sources/agent-desktop-LICENSE" if path == "LICENSE" else path
            result.files[target] = data
    required = {"sources/agent-desktop-LICENSE", "skills/agent-desktop/SKILL.md", "skills/agent-desktop-windows/SKILL.md"}
    if not required.issubset(result.files):
        raise HarnessError("Official agent-desktop skills or LICENSE are missing")
    candidate["agent_desktop"].update(version=version, source=f"https://github.com/{repo}", source_commit=commit,
        url=asset["browser_download_url"], sha256=sha256, executable_sha256=digest(executable),
        files_sha256={path: digest(data) for path, data in sorted(result.files.items())})
    return result


def stamp_registry(lock: dict, registry: Registry):
    lock.update(schema_version=2, registry_sha256=registry.fingerprint,
                registrations={"plugins": copy.deepcopy(list(registry.plugins)), "mcp": copy.deepcopy(list(registry.mcp))})
    lock.setdefault("plugins", [])
    lock.setdefault("mcp", [])


def find_codex(explicit: str | None, codex_home: Path) -> str | None:
    if explicit:
        return str(Path(explicit).resolve()) if Path(explicit).is_file() else shutil.which(explicit)
    found = shutil.which("codex")
    if found:
        return found
    config = codex_home / "config.toml"
    if config.exists():
        candidate = read_toml(config).get("mcp_servers", {}).get("node_repl", {}).get("env", {}).get("CODEX_CLI_PATH")
        if candidate and Path(candidate).is_file():
            return str(candidate)
    return None


def install_agent(lock: dict, local: Path, staged: bytes | None = None) -> Path:
    destination = local / "tools" / "agent-desktop" / "agent-desktop.exe"
    safe_file(destination, local)
    if destination.is_file() and digest(destination.read_bytes()) == lock["executable_sha256"]:
        return destination
    archive = local / "downloads" / f"agent-desktop-v{lock['version']}-{lock['sha256']}.tar.gz"
    safe_file(archive, local)
    data = staged if staged is not None else archive.read_bytes() if archive.is_file() else fetch(lock["url"])
    executable = extract_agent(data, lock["sha256"])
    if digest(executable) != lock["executable_sha256"]:
        raise HarnessError("agent-desktop executable SHA256 mismatch")
    if not archive.exists() or archive.read_bytes() != data:
        atomic_write(archive, data)
    atomic_write(destination, executable)
    return destination


def install_codegraph(lock: dict, local: Path, npm: str) -> Path:
    prefix = local / "tools" / "codegraph"
    safe_file(prefix, local)
    prefix.mkdir(parents=True, exist_ok=True)
    subprocess.run([npm, "install", "--prefix", str(prefix), "--ignore-scripts", "--include=optional",
                    "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org",
                    f"{lock['package']}@{lock['version']}"], check=True)
    manifest = prefix / "node_modules" / "@colbymchenry" / "codegraph" / "package.json"
    metadata = json.loads(manifest.read_text(encoding="utf-8"))
    receipt = json.loads((prefix / "package-lock.json").read_text(encoding="utf-8"))
    if metadata["version"] != lock["version"] or receipt["packages"]["node_modules/@colbymchenry/codegraph"]["integrity"] != lock["integrity"]:
        raise HarnessError("CodeGraph version/integrity does not match the lock")
    # The official shim otherwise downloads into the user's home on first use.
    bundle = prefix / "node_modules" / "@colbymchenry" / "codegraph-win32-x64"
    if not (bundle / "node.exe").is_file() or not (bundle / "lib/dist/bin/codegraph.js").is_file():
        raise HarnessError("CodeGraph's Windows x64 optional bundle is missing; no home-directory fallback was run")
    launcher = prefix / "node_modules" / ".bin" / "codegraph.cmd"
    safe_file(launcher, local)
    original = launcher.read_bytes()
    quoted = original.replace(b"SET dp0=%~dp0", b'SET "dp0=%~dp0"')
    if quoted != original:
        atomic_write(launcher, quoted)
    return launcher


def plugin_cache_digest(plugin: dict, codex_home: Path) -> str | None:
    root = codex_home / "plugins/cache" / plugin["marketplace"] / plugin["name"] / plugin["version"]
    safe_file(root, codex_home)
    if not root.is_dir():
        return None
    files = {}
    for path in root.rglob("*"):
        safe_file(path, codex_home)
        if path.is_file() and ".git" not in path.relative_to(root).parts:
            files[path.relative_to(root).as_posix()] = blob_digest(path.read_bytes())
    return content_digest(files)


def register_marketplace(plugin: dict, codex: str, codex_home: Path, environment: dict, *, plugins: list | None = None):
    config = codex_home / "config.toml"
    safe_file(config, codex_home)
    old = read_toml(config) if config.exists() else {}
    previous = old.get("marketplaces", {}).get(plugin["marketplace"])
    selections = {key: copy.deepcopy(value) for key, value in old.get("plugins", {}).items()
                  if key.endswith("@" + plugin["marketplace"])}
    base = [codex, "plugin", "marketplace"]
    changed = previous and (previous.get("source") != plugin["source"] or previous.get("ref") != plugin["ref"]
                            or any("content_sha256" in item and plugin_cache_digest(item, codex_home) != item["content_sha256"]
                                   for item in (plugins or [plugin])))
    if changed:
        subprocess.run([*base, "remove", plugin["marketplace"], "--json"], check=True, env=environment, capture_output=True)
    try:
        try:
            response = subprocess.run([*base, "add", plugin["source"], "--ref", plugin["ref"], "--json"],
                                      check=True, env=environment, capture_output=True, text=True, encoding="utf-8")
        except subprocess.CalledProcessError:
            if changed:
                restore = [*base, "add", previous["source"]]
                if previous.get("ref"):
                    restore.extend(["--ref", previous["ref"]])
                subprocess.run([*restore, "--json"], check=True, env=environment, capture_output=True)
                for selector in selections:
                    subprocess.run([codex, "plugin", "add", selector, "--json"], check=True,
                                   env=environment, capture_output=True)
            raise
        configured = read_toml(config).get("marketplaces", {}).get(plugin["marketplace"], {})
        if configured.get("source") != plugin["source"] or configured.get("ref") != plugin["ref"]:
            raise HarnessError(f"Marketplace did not register the requested ref: {plugin['marketplace']}")
        root = json.loads(response.stdout)["installedRoot"]
        head = subprocess.run(["git", "-C", root, "rev-parse", "HEAD"], check=True,
                              capture_output=True, text=True, encoding="utf-8", env=environment).stdout.strip()
        if head != plugin["ref"]:
            raise HarnessError(f"Marketplace checkout has the wrong commit: {plugin['marketplace']}")
        if changed:
            managed = {f"{item['name']}@{item['marketplace']}" for item in (plugins or [plugin])}
            for selector in selections.keys() - managed:
                subprocess.run([codex, "plugin", "add", selector, "--json"], check=True, env=environment, capture_output=True)
    finally:
        if changed and selections:
            current = read_toml(config) if config.exists() else tomlkit.document()
            if "plugins" not in current:
                current["plugins"] = tomlkit.table()
            for selector, settings in selections.items():
                current["plugins"][selector] = settings
            atomic_write(config, tomlkit.dumps(current).encode("utf-8"))


def install_plugins(plugins: list, codex: str, codex_home: Path):
    environment = os.environ.copy()
    environment["CODEX_HOME"] = str(codex_home)
    count = int(environment.get("GIT_CONFIG_COUNT", "0"))
    for key, value in (("core.autocrlf", "false"), ("core.eol", "lf")):
        environment[f"GIT_CONFIG_KEY_{count}"] = key
        environment[f"GIT_CONFIG_VALUE_{count}"] = value
        count += 1
    environment["GIT_CONFIG_COUNT"] = str(count)
    groups = {}
    for plugin in plugins:
        group = groups.setdefault(plugin["marketplace"], [])
        if group and (group[0]["source"], group[0]["ref"]) != (plugin["source"], plugin["ref"]):
            raise HarnessError(f"Incoherent marketplace lock for {plugin['marketplace']}")
        group.append(plugin)
    for group in groups.values():
        if len(group) == 1:
            register_marketplace(group[0], codex, codex_home, environment)
        else:
            register_marketplace(group[0], codex, codex_home, environment, plugins=group)
        for plugin in group:
            selector = f"{plugin['name']}@{plugin['marketplace']}"
            subprocess.run([codex, "plugin", "add", selector, "--json"], check=True, env=environment, capture_output=True)
        for plugin in group:
            selector = f"{plugin['name']}@{plugin['marketplace']}"
            relative = plugin["manifest"][len(plugin_prefix(plugin["manifest"])):]
            manifest = codex_home / "plugins/cache" / plugin["marketplace"] / plugin["name"] / plugin["version"] / relative
            safe_file(manifest, codex_home)
            metadata = json.loads(manifest.read_text(encoding="utf-8"))
            if metadata.get("name") != plugin["name"] or metadata.get("version") != plugin["version"]:
                raise HarnessError(f"Installed plugin does not match the lock: {selector}")
            if "content_sha256" in plugin and plugin_cache_digest(plugin, codex_home) != plugin["content_sha256"]:
                raise HarnessError(f"Installed plugin source content does not match the resolved commit: {selector}")


def sync_sources(result: Resolution, repo: Path, backup_root: Path | None = None):
    record = result.lock["agent_desktop"]
    expected = record.get("files_sha256", {})
    if not expected:
        return
    official_source_files(result.lock)
    files = dict(result.files)
    for path, sha256 in expected.items():
        if path not in files:
            cached = repo / path
            safe_file(cached, repo)
            if backup_root is not None and cached.is_file() and digest(cached.read_bytes()) == sha256:
                files[path] = cached.read_bytes()
            else:
                source = "LICENSE" if path == "sources/agent-desktop-LICENSE" else path
                files[path] = fetch(f"https://raw.githubusercontent.com/vercel-labs/agent-desktop/{record['source_commit']}/{source}")
        if digest(files[path]) != sha256:
            raise HarnessError(f"Locked source digest mismatch: {path}")
    managed = ("skills/agent-desktop", "skills/agent-desktop-windows")
    for path in files:
        if ".." in Path(path).parts or Path(path).is_absolute() or "\\" in path:
            raise HarnessError(f"Unsafe managed source path: {path}")
        if path != "sources/agent-desktop-LICENSE" and not any(path.startswith(prefix + "/") for prefix in managed):
            raise HarnessError(f"Unexpected managed source path: {path}")
        safe_file(repo / path, repo)
        target = repo / path
        if target.is_dir() or any(parent.is_file() for parent in target.parents if parent != repo):
            raise HarnessError(f"Managed source changes file/directory shape; no sources were written: {path}")
    existing = []
    for prefix in managed:
        root = repo / prefix
        safe_file(root, repo)
        for path in root.rglob("*"):
            safe_file(path, repo)
            if path.is_file():
                existing.append(path)
    license_path = repo / "sources/agent-desktop-LICENSE"
    if license_path.exists():
        existing.append(license_path)
    if set(files) == {path.relative_to(repo).as_posix() for path in existing} and all(
            (repo / path).read_bytes() == data for path, data in files.items()):
        return
    backup_root = backup_root or repo / ".local/source-backups"
    safe_file(backup_root, repo)
    backup_root.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix="agent-desktop-", dir=backup_root))
    for path in existing:
        atomic_write(backup / path.relative_to(repo), path.read_bytes())
    for path, data in files.items():
        atomic_write(repo / path, data)
    for path in existing:
        if path.relative_to(repo).as_posix() not in files:
            path.unlink()


def save_paths(path: Path, agent: Path, codegraph: Path):
    local = read_toml(path) if path.exists() else tomlkit.document()
    if "paths" not in local:
        local["paths"] = tomlkit.table()
    for key, executable in (("agent_desktop", agent), ("codegraph", codegraph)):
        if key not in local["paths"]:
            local["paths"][key] = executable.as_posix()
        elif local["paths"][key] != executable.as_posix():
            print(f"Keeping existing local paths.{key}")
    rendered = tomlkit.dumps(local).encode("utf-8")
    if not path.exists() or path.read_bytes() != rendered:
        atomic_write(path, rendered)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", action="store_true")
    parser.add_argument("--locked", action="store_true", help="Use the existing exact lock without latest metadata lookups")
    parser.add_argument("--host", default=os.environ.get("COMPUTERNAME", "").lower())
    parser.add_argument("--codex-home", type=Path, default=Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))))
    parser.add_argument("--codex")
    parser.add_argument("--local-config", type=Path)
    parser.add_argument("--state-root", type=Path)
    args = parser.parse_args(argv)
    try:
        host = args.host.lower()
        if host not in ("homelab-desktop", "roylabs-desktop"):
            raise HarnessError("Select homelab-desktop or roylabs-desktop")
        layout = select_layout(REPO, args.state_root)
        lock_path = layout.lock
        local = layout.local
        config = (args.local_config or local / f"{host}.toml").resolve()
        if not config.is_relative_to(local):
            raise HarnessError("Dependency installer local-config must be inside the selected state root (.local by default)")
        seed = lock_path if lock_path.exists() else layout.seed_lock
        result = resolve(json.loads(seed.read_text(encoding="utf-8")), locked=args.locked)
        lock = result.lock
        for record in lock.get("mcp", []):
            mcp_packages.configuration(record, local)
        if layout.persistent:
            official_source_files(lock)
        codex_home = args.codex_home.resolve()
        codex = find_codex(args.codex, codex_home)
        print(f"Agent desktop {lock['agent_desktop']['version']} -> {local / 'tools/agent-desktop'} (SHA256 verified on install)")
        print(f"{lock['codegraph']['package']}@{lock['codegraph']['version']} -> {local / 'tools/codegraph'}")
        for item in lock["plugins"]:
            print(f"{item['name']}@{item['marketplace']} version {item['version']}: {item['source']} ref {item['ref']}")
        for item in lock.get("mcp", []):
            print(f"MCP {item['name']} ({item['kind']})")
        print(f"Codex CLI: {codex or '(specify --codex)'}\nCodex home: {codex_home}\nLocal paths: {config}")
        if not args.install:
            print("Preview only. Pass -Install to install dependencies. No files were written.")
            return 0
        if os.name != "nt" or platform.machine().lower() not in ("amd64", "x86_64"):
            raise HarnessError("The pinned agent-desktop release targets Windows x64")
        npm = shutil.which("npm")
        if not npm or not shutil.which("git") or not codex:
            raise HarnessError("Install Node/npm, Git and Codex first; specify --codex when it is not on PATH")
        safe_file(config, local)
        safe_file(lock_path, local if layout.persistent else REPO)
        agent = install_agent(lock["agent_desktop"], local, result.archive)
        codegraph = install_codegraph(lock["codegraph"], local, npm)
        install_plugins(lock["plugins"], codex, codex_home)
        for record in lock.get("mcp", []):
            mcp_packages.install(record, local, guard=safe_file)
        if layout.persistent:
            sync_sources(result, layout.sources, layout.source_backups)
        else:
            sync_sources(result, REPO)
        save_paths(config, agent, codegraph)
        atomic_write(lock_path, (json.dumps(lock, indent=2) + "\n").encode("utf-8"))
        print(f"Dependencies installed and lock saved. Run harness.ps1 apply/check -HostName {host}.")
        return 0
    except (HarnessError, OSError, ValueError, KeyError, tarfile.TarError, subprocess.CalledProcessError, tomlkit.exceptions.TOMLKitError) as exc:
        message = ("Dependency operation failed" if isinstance(exc, (OSError, subprocess.CalledProcessError,
                                                                    tomlkit.exceptions.TOMLKitError)) else str(exc))
        print(f"ERROR {message}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
