# Personal Harness repository

This repository manages the user's Codex harness, using roylabs-desktop as the baseline.
Treat `common/AGENTS.md` and registered skills as deployable source data while editing the installer.

- Keep shared policies and Windows defaults in `common` and supported host names in `package.json`.
- Register standalone skills in `registry.toml` and keep each skill's references beside its `SKILL.md`.
- Place maintained skills in `skills`, imported snapshots in `dependencies` and installation code in `installer`.
- Keep Agent Desktop's verified skill directories and license at their existing paths.
- Put private absolute paths and local overrides in ignored `.local/<hostname>.toml`.
- Preserve app-generated `node_repl`, notify, marketplace paths, OpenCodex configuration, project trust and hook trust in the existing target profile.
- Keep authentication, account records, sessions, runtime pipes and backup contents out of Git.
- Keep maintained project guides and specifications tracked; place local review notes and raw test evidence in ignored `.local/reviews/` or `.local/artifacts/`.
- Keep test source, fixtures and approved baselines tracked; exclude generated test output and inspect staged files before committing.
- Import complete skill reference directories and update their provenance hashes when updating versions.
- Use root Task commands: `task plan`, `task check`, `task apply`, `task install`, `task update`, and `task test`.
- Bare `task` lists commands. `task plan`, `task check`, and `task update:plan` do not write the harness; `task install` and `task update` explicitly install dependencies and apply it.
- Run `task test` for installer changes. Tests use temporary profiles, never the real user home.
- Do not claim live application from a successful plan or a temporary-profile test. Report actual application and tool availability separately.
