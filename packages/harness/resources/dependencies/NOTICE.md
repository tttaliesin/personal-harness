# Imported user harness sources

`common/AGENTS.md` and `skills/custom/create-readme/SKILL.md` came from the user's Roylabs Codex profile on 2026-11-12.
The one absolute Codex home path in `AGENTS.md` was replaced with `${CODEX_HOME}`.
The original SHA256 values and imported skill hashes are recorded in [roylabs-2026-11-12.json](roylabs-2026-11-12.json).

Ego and its bundled skills are owned by each PC's browser installation and are outside this repository's managed dependencies.
The installer does not install, version-check, link or overwrite them.
The CodeGraph and OpenSpec CLIs are resolved from their official npm latest stable releases when installation or update is explicitly requested.
Exact successful installation results are recorded in [dependencies.lock.json](dependencies.lock.json).
Taste Skill is registered from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) as the original Codex plugin `taste-skill@taste-skill`.
The official CLI installs its complete source, including skill references, scripts, assets and MIT license.
The selected stable release, exact commit and whole-plugin source digest are recorded in the dependency lock.
The harness does not edit upstream plugin files; its task selection and existing-project preservation rules live in `common/AGENTS.md`.

Context7 is registered from the official [upstash/context7.git](https://github.com/upstash/context7.git) repository as `context7@context7-marketplace`.
The registry tracks `master` through `git-ref`; the existing installer locks the resolved exact commit and content digest.
The currently verified [Codex plugin manifest](https://github.com/upstash/context7/blob/master/plugins/codex/context7/.codex-plugin/plugin.json) version is `1.0.2`.
The official [marketplace catalog](https://github.com/upstash/context7/blob/master/.agents/plugins/marketplace.json) points to `plugins/codex/context7`.
The plugin connects to the hosted endpoint `https://mcp.context7.com/mcp` rather than adding a local MCP server process.
Its bundled skill supports autonomous selection for library documentation and version-specific API checks.
Harness routing first checks the project's actual dependency version and does not require a lookup before known direct reads or small mechanical edits.
Unsupported queries, authentication requirements, rate limits or insufficient results fall back to official documentation and source inspection.
The harness preserves upstream plugin files, caches and project governance.
Account records and authentication tokens remain outside Git.
The [official Codex guide](https://context7.com/docs/clients/codex) instructs users to start a new thread after installation.
Installation integrity and successful documentation retrieval are recorded separately in the [2026-11-17 deployment record](../../../../docs/history/context7-2026-11-17.md).

Microsoft Learn is registered as the official remote HTTP MCP endpoint `https://learn.microsoft.com/api/mcp`.
Its connection declaration is recorded in `registry.toml` and the dependency lock; no upstream package or skill is copied into this repository.
The [official developer reference](https://learn.microsoft.com/en-us/training/support/mcp-developer-reference) describes its transport and documentation tools.
The server's tool catalog is discovered at connection time.
Autonomous selection and version-aware use are configured in `common/AGENTS.md` without a fixed call order with Context7.

NuGet is registered from the official Microsoft `NuGet.Mcp.Server` package on [NuGet.org](https://www.nuget.org/packages/NuGet.Mcp.Server).
Its exact base and Windows x64 payload packages and the isolated .NET 10 SDK archive are recorded with integrity hashes in the dependency lock.
The SDK is obtained from Microsoft's official release metadata and its published SHA512 is checked before extraction.
The original package payload and license are retained without modification in the managed installation.
The harness does not add project SDK declarations or change target frameworks, global PATH, authentication or repo-governance.
Package metadata is reference material and does not supersede repository or user constraints.
See the [official NuGet MCP documentation](https://learn.microsoft.com/en-us/nuget/concepts/nuget-mcp-server).

## External standalone skills and references

The registry declares the upstream repositories, update channels, and file mappings. [registry.toml](../registry.toml)
Ordinary installation and update resolve each selected commit and validate the mapped files.
The local `external-skills.json` cache holds those commits and file contents.
See the upstream repositories for their MIT license notices.

`feature-sliced-design` installs the original skill directory, including its references and evals, from the default branch. [feature-sliced/skills](https://github.com/feature-sliced/skills)
The official FSD documentation identifies it as a community-driven skill and links its installation source. [FSD documentation](https://fsd.how/docs/llms/)
The skill follows FSD methodology version 2.1.
The installer records the resolved default-branch commit as the installed skill's source revision.
Autonomous selection is limited to repositories already adopting FSD by `common/AGENTS.md`.
Steiger and ArchUnitNET remain per-repository tools rather than global harness dependencies.

`skills/adapters/ste-ko` contains the harness's document-scoped `SKILL.md`.
The installer adds the declared STE-KO references and `LICENSE` from the default branch. [beamonic/ste-ko](https://github.com/beamonic/ste-ko)

`humanize-korean` installs the original Codex entrypoint, references, runtime scripts, and `LICENSE` from the latest stable GitHub release. [epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai)
The common routing selects the Korean editor when a draft needs polishing and compares changed clauses with the original.
`skills/adapters/humanize-windows-runtime` supplies repository-authored Windows preparation for the upstream package.
It allocates a shared run path and passes it to the original script.

## Maintained local skills and adapters

`skills/adapters/openspec-workflow` is a Personal Harness adapter authored in this repository.
It uses the official OpenSpec CLI's schema and instructions instead of distributing modified upstream workflow skills.
The initial adapter was checked against `@fission-ai/openspec` 2.0.0 and the [official CLI reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md).
`skills/custom/korean-typography` is authored in this repository for Korean web typography.
Its references link to original font publishers and W3C layout/CSS guidance.
It distributes no font binaries and does not modify Taste Skill or other upstream packages.

`skills/custom/development-environment` and `skills/custom/repository-artifacts` are authored in this repository.
They provide task-based development environment and artifact disposition guidance while deferring to adopted repository governance.
They contain no third-party binaries, runtime installers, hooks, or changes to repo-governance.
pstack and EGM were removed from managed dependencies on 2026-11-16.
The original pstack import used the upstream tag for Roylabs' installed version because the exact original checkout commit was unavailable.

## Windows Taste 실행 호환

`skills/adapters/taste-windows-runtime`은 이 저장소에서 작성한 실행 어댑터다.
원본 Taste 플러그인을 포함하거나 패치하지 않는다.
선택한 브라우저와 Node 실행 옵션은 검사 자식 프로세스에만 전달한다.
