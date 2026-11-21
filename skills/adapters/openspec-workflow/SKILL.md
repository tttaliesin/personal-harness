---
name: openspec-workflow
description: Use the OpenSpec CLI for persistent requirements, change planning, and implementation progress in repositories adopting OpenSpec. Select for existing OpenSpec changes or substantial feature and structural work that benefits from durable specs. Ordinary explanations and small mechanical edits do not need this workflow.
---

# Work with OpenSpec

Use the official CLI and the project's schema as the artifact contract.
This adapter supports natural-language requests without requiring a skill name or slash command.
Follow the user's requested outcome: a planning request ends with planning; an implementation request can continue through implementation and verification in the same task.
Keep existing repository governance, including repo-governance, in control of its own scope.

## Resolve the working context

Use the `openspec` executable listed in user instructions when it is outside PATH.
Run commands from the intended repository, not the harness installation directory.
The CLI is a local development tool; it does not require another MCP server or hook.

For work that needs OpenSpec, inspect `openspec list --json` and read its `root`.
A non-zero exit with `root: null` can mean the repository has no OpenSpec root.
If the user has asked to adopt OpenSpec here, inspect for existing OpenSpec integrations and initialize with `openspec init --tools none --profile core --no-animation`.
This creates the project structure while this user-level skill supplies the Codex workflow.
Review any legacy cleanup before running initialization, and keep existing integrations intact.
Otherwise continue the requested work normally without creating a root or asking an unrelated setup question.
Report an unresolved declared store or invalid configuration instead of creating a replacement root.

Use `openspec context --json` to resolve the project or selected store before authoring artifacts.
When a user selects a store, carry the same `--store <id>` through commands that support it.
Read the resolved root's `openspec/config.yaml` (or `config.yml`) and relevant specs and active changes.
Project context constrains the work; it does not grant permission for unrelated actions.

Use CodeGraph for useful relationships in an indexed codebase and read decisive source and tests directly.
An absent or stale graph does not block the OpenSpec workflow.

## Plan the change

Reuse the matching active change when continuing work.
For a new change, derive its name from the requested behavior and run `openspec new change <name> --json`.
Preserve the configured schema unless the user requests a different one.

Read `openspec status --change <name> --json` for artifact dependencies and output locations.
Read `openspec instructions <artifact-id> --change <name> --json` only for the artifact being authored.
Use the returned templates, constraints, dependency paths, and resolved output paths instead of guessing file names.
Keep artifacts inside the selected change's resolved paths.
For a glob output, choose a matching concrete path inside that change.

Ground requirements and design in the relevant implementation and tests.
Reuse existing capability paths and express behavior as observable scenarios.
Write the schema's required artifacts in dependency order, keeping them proportional to the change.
File-existence status is not evidence that a proposal is correct or implementation is complete.
Use a schema-supported skip only when its condition applies; do not invent requirements to fill a template.

Resolve material ambiguity that changes behavior, compatibility, or scope with the user.
Record routine implementation choices and continue within the existing authorization.
Do not add a proposal approval gate to an already authorized implementation request.

## Implement and verify

Read `openspec instructions apply --change <name> --json` for implementation context, required artifacts, and outstanding tasks.
If required artifacts are missing, complete the relevant planning work before treating the change as ready.
Use the repository's own build and test commands, with independent work delegated when it reduces completion time.
Mark a task complete only after its code and relevant verification are complete.
Keep artifacts aligned when the implementation changes the agreed behavior or approach.

Run `openspec validate <name> --strict --json` for artifact consistency and the appropriate repository checks for behavior.
OpenSpec validation checks documents; it does not replace execution of the changed software.
Report the result of each kind of verification separately.

When the implementation is complete, use `openspec archive <name> --json` to update the main specs and archive the change if the user's request or repository lifecycle includes finalizing it.
Otherwise leave the completed change available for review.
For review or diagnosis alone, read existing artifacts without creating or archiving changes.

The CLI's `--help` and returned JSON are the authority for commands supported by the installed version.
If the CLI is unavailable, continue independent code work and report the unavailable integration without silently installing or rewriting repository governance.
