# Personal Harness repository

This repository manages the user's Codex harness, using roylabs-desktop as the baseline.
Treat `packages/harness/resources/common/AGENTS.md` and registered skills as deployable source data while editing the installer.

- Keep shared policies in `packages/harness/resources/common/` and supported host names in the root `package.json`.
- Register each standalone skill with its `role` in `packages/harness/resources/registry.toml` and keep its maintained local references beside its `SKILL.md`.
- Place independent harness skills in `packages/harness/resources/skills/custom/<name>/` with `role = "custom"`.
- Place integration and compatibility skills in `packages/harness/resources/skills/adapters/<name>/` with `role = "adapter"` and an `adapts` target.
- Track only maintained skill source and local adapters in Git.
- Declare external skill sources in `registry.toml` with `source` (an HTTPS GitHub repository), `channel`, and `files` (installation destination to upstream relative path).
- Use `role = "upstream"` for external standalone skills.
- Keep the `ste-ko` adapter's local `SKILL.md` and declare its external reference files with the same source fields.
- Keep installation code, `personal-harness.mjs`, and `requirements.txt` in `packages/harness/installer/`.
- Keep the dependency seed data in `packages/harness/resources/dependencies/`.
- Keep harness tests and fixtures in `packages/harness/tests/` and the cross-package marketplace test at `tests/test_codex_marketplace.py`.
- Keep each owned plugin's source and tests in its own `packages/<name>/` directory.
- Keep the `personal-harness` Codex Git marketplace at `.agents/plugins/marketplace.json` on the public default branch `main`.
- Publish the public repo-governance core from `packages/repo-governance/plugin/`.
- Publish the verified Windows Agent Devkit and Worker Orchestrator bundles from `packages/windows-agent-devkit/release/` and `packages/worker-orchestrator/release/`.
- Preserve the verified release payloads byte for byte during relocations and keep Git line-ending conversion disabled in both `release/` directories.
- Keep PC paths, personal and organization settings, and product bindings in their respective local environments.
- Put private absolute paths and local overrides in ignored `.local/<hostname>.toml`.
- Preserve app-generated `node_repl`, notify, marketplace paths, OpenCodex configuration, project trust and hook trust in the existing target profile.
- Keep authentication, account records, sessions, runtime pipes and backup contents out of Git.
- Keep maintained project guides and specifications tracked; place local review notes and raw test evidence in ignored `.local/reviews/` or `.local/artifacts/`.
- Keep test source, fixtures and approved baselines tracked; exclude generated test output and inspect staged files before committing.
- Keep selected upstream revisions and validated file contents in `.local/external-skills.json` or `<state-root>/external-skills.json` when a state root is selected.
- Refresh external skill sources with ordinary `task install` or `task update`.
- Use the cache for `task plan`, `task check`, and `task apply`.
  Locked installs require an existing compatible cache.
- Use root Task commands: `task plan`, `task check`, `task apply`, `task install`, `task update`, and `task test`.
- Bare `task` lists commands. `task plan`, `task check`, and `task update:plan` do not write the harness; `task install` and `task update` explicitly install dependencies and apply it.
- Run `task test` for installer changes. Tests use temporary profiles, never the real user home.
- Do not claim live application from a successful plan or a temporary-profile test. Report actual application and tool availability separately.
