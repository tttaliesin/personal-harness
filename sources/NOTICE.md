# Imported user harness sources

`common/AGENTS.md` and `skills/create-readme/SKILL.md` came from the user's Roylabs Codex profile on 2026-11-12.
The one absolute Codex home path in `AGENTS.md` was replaced with `${CODEX_HOME}`.
The original SHA256 values and imported skill hashes are recorded in [roylabs-2026-11-12.json](roylabs-2026-11-12.json).

`skills/agent-desktop` and `skills/agent-desktop-windows` contain unmodified official Vercel Labs agent-desktop skills and references.
The original import used v1.0.2 at revision `a47ed664e0db00d1d4df364eb3fe8a5599882f3c` in [vercel-labs/agent-desktop](https://github.com/vercel-labs/agent-desktop/tree/a47ed664e0db00d1d4df364eb3fe8a5599882f3c).
Updates replace them with the complete skill directories from the resolved official release.
The current release and provenance are recorded by the dependency installer after successful installation.
The upstream [Apache 2.0 license](agent-desktop-LICENSE) is included.

Ego and its bundled skills are owned by each PC's browser installation and are outside this repository's managed dependencies.
The installer does not install, version-check, link or overwrite them.
The CodeGraph and OpenSpec CLIs are resolved from their official npm latest stable releases when installation or update is explicitly requested.
Exact successful installation results are recorded in [dependencies.lock.json](dependencies.lock.json).
`skills/openspec-workflow` is a Personal Harness adapter authored in this repository.
It uses the official OpenSpec CLI's schema and instructions instead of distributing modified upstream workflow skills.
The initial adapter was checked against `@fission-ai/openspec` 2.0.0 and the [official CLI reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md).
pstack and EGM were removed from managed dependencies on 2026-11-16.
The original pstack import used the upstream tag for Roylabs' installed version because the exact original checkout commit was unavailable.
