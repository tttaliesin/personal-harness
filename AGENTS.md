# Personal Harness repository

This repository distributes standalone skills through the skills CLI and the Codex marketplace.
It also distributes three separately packaged Codex plugins.

## Standalone skills

- Place independent skills in `skills/custom/<name>/`.
- Place integration and compatibility skills in `skills/adapters/<name>/`.
- Keep each skill's maintained references and scripts next to its `SKILL.md`.
- Distribute standalone skills with `npx skills@latest add https://github.com/tttaliesin/personal-harness/tree/main/skills -a codex`.
  Use `-g` for user-wide installation.
  The CLI discovers skills under both roots.
- Set the marketplace `source.path` for `personal-harness-skills@personal-harness` to `./skills/custom`.
- Set the marketplace `source.path` for `personal-harness-adapters@personal-harness` to `./skills/adapters`.
- Keep a `.codex-plugin/plugin.json` at each bundle root so users can install each bundle separately.
- List each child skill directory by relative path in its bundle manifest's `skills` field.
  Update the list when adding or removing a skill.
- Manage each bundle's release version in its own manifest's `version` field.
- Keep external resource source URLs, upstream paths and update channels in the root `external-resources.toml` reference manifest.
  Follow each upstream project's installation instructions.
- Keep the `ste-ko` adapter's local `SKILL.md` in `skills/adapters/ste-ko/` and record its upstream specification and reference paths in the manifest.

## Owned plugins

- Keep each plugin with its own implementation and tests in `packages/<name>/`.
- Keep the `personal-harness` Codex Git marketplace at `.agents/plugins/marketplace.json` on the public default branch `main`.
- Publish the public repo-governance core from `packages/repo-governance/plugin/`.
- Publish the verified Windows Agent Devkit and Worker Orchestrator bundles from `packages/windows-agent-devkit/release/` and `packages/worker-orchestrator/release/`.
- Preserve verified release payloads byte for byte during relocations.
  Keep Git line-ending conversion disabled in both `release/` directories.
- Use [the release procedure](docs/deployment.md) to verify release hashes and record provenance when publishing a new version.

## Repository checks and data

- Run `npm test` from the repository root.
  Use the package-level commands in [the release procedure](docs/deployment.md#새-버전-게시) for plugin releases.
- Keep PC paths, product bindings, personal and organization settings, and app-generated runtime and trust data in their respective local environments.
- Keep authentication, account records, sessions, runtime pipes and backup contents out of Git.
- Track maintained project guides, specifications, test source, fixtures and approved baselines.
- Put local review notes and raw test evidence in ignored `.local/reviews/` or `.local/artifacts/`.
- Inspect staged files before committing.
