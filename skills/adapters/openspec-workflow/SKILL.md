---
name: openspec-workflow
description: Use the OpenSpec CLI for requested adoption, existing changes, or substantial work that needs durable specs in an OpenSpec repository.
---

# Work with OpenSpec

Run the official CLI from the intended repository.
Use the `openspec` executable listed in user instructions if it is outside PATH.
Follow the project's schema and repository governance.
Carry a selected `--store <id>` through commands that support it.
Use the installed CLI's `--help` and JSON output to resolve questions about supported syntax and results.
For review or diagnosis alone, read the existing artifacts.

## Implement an existing change

When the root and change are known, start with `openspec instructions apply --change <name> --json` as the first OpenSpec lookup.
Use its context files, required artifacts, and outstanding tasks to guide implementation.
If required artifacts are missing, use the authoring route to complete them before treating the change as ready.
Carry an authorized implementation through planning and verification in the same task under the repository's existing approval rules.
Use the repository's own build and test commands.
Mark a task complete only after its implementation and relevant verification are complete.
Keep artifacts aligned with the agreed behavior and approach.

## Author a proposal or spec

Read [Author OpenSpec artifacts](references/authoring.md) when you need to create or revise change artifacts.
For planning-only requests, deliver the requested artifacts and their validation result.

## Archive a completed change

Archive only when the user's request or the repository lifecycle authorizes finalization.
Confirm that implementation, any tracked tasks, and relevant verification are complete.
After strict validation passes, run `openspec archive <name> --json` to update the main specs and archive the change.

## Validation

Run `openspec validate <name> --strict --json` for authored changes, completed implementations, and changes being archived.
Report artifact validation and repository behavior checks separately.

## Resolve missing context

Use `openspec list --json` when you need to find the root or identify an active change.
Use `openspec context --json` when you need details of the project's or selected store's working context.
Write OpenSpec artifacts only in a confirmed root because `openspec new change` can create an implicit root.

A nonzero exit with `root: null` can indicate that the project has no OpenSpec root.
If the target configuration is invalid or the target store cannot be resolved, report the diagnostic and stop OpenSpec writes there.
Initialize only when the project has no root and the user requests OpenSpec adoption.
Review legacy cleanup and preserve existing integrations when running `openspec init --tools none --profile core --no-animation`.
Without a root, continue work that can proceed independently.

If the CLI is unavailable, report the blocker and continue independent work.
Keep tool setup and governance changes within the user's authorization.
