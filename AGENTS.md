# Personal Harness repository

This repository manages the user's Codex harness, using roylabs-desktop as the baseline.
Treat `common/AGENTS.md` and registered skills as deployable source data while editing the installer.

- Keep shared policies and Windows defaults in `common` and supported host names in `package.json`.
- Register each standalone skill with its `role` in `registry.toml`.
- Place independent skills in `skills/custom/<name>/` with `role = "custom"`.
- Place integration and compatibility skills in `skills/adapters/<name>/` with `role = "adapter"` and an `adapts` target.
- Keep maintained local references beside each skill's `SKILL.md`.
- Declare externally fetched standalone skills with `role = "upstream"`, an HTTPS GitHub repository in `source`, a `channel`, and a `files` mapping from installation targets to upstream relative paths.
- Keep the `ste-ko` adapter's local `SKILL.md` and declare its external references with the same source fields.
- Place owned plugin projects in `plugins` and installation code in `installer`.
- Keep the `personal-harness` Codex Git marketplace at `.agents/plugins/marketplace.json` on the public default branch `main`.
- Publish the public repo-governance core from `plugins/repo-governance/plugin` and the verified Windows Agent Devkit and Worker Orchestrator packages from `marketplace`.
- Keep Git line-ending conversion disabled for the verified release payloads in `marketplace`.
- Keep PC paths, personal and organization settings, and product bindings in their respective local environments.
- Put private absolute paths and local overrides in ignored `.local/<hostname>.toml`.
- Preserve app-generated `node_repl`, notify, marketplace paths, OpenCodex configuration, project trust and hook trust in the existing target profile.
- Keep authentication, account records, sessions, runtime pipes and backup contents out of Git.
- Keep maintained project guides and specifications tracked; place local review notes and raw test evidence in ignored `.local/reviews/` or `.local/artifacts/`.
- Keep test source, fixtures and approved baselines tracked; exclude generated test output and inspect staged files before committing.
- Keep selected upstream revisions and validated file contents in `.local/external-skills.json` or `<state-root>/external-skills.json` when a state root is selected.
- Refresh this cache with ordinary `task install` or `task update`.
- Use the cache for `task plan`, `task check`, and `task apply`. Locked installs require an existing compatible cache.
- Use root Task commands: `task plan`, `task check`, `task apply`, `task install`, `task update`, and `task test`.
- Bare `task` lists commands. `task plan`, `task check`, and `task update:plan` do not write the harness; `task install` and `task update` explicitly install dependencies and apply it.
- Run `task test` for installer changes. Tests use temporary profiles, never the real user home.
- Do not claim live application from a successful plan or a temporary-profile test. Report actual application and tool availability separately.
