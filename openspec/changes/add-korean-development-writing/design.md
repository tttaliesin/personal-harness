# Design

## Context

The harness deploys repository-backed skills to each user's agent skills directory.
Both Windows hosts already have Codex profiles that retain their own settings and plugins.

## Decisions

- Deploy the original STE-KO reference documents through a document-scoped entrypoint. Make the scope clear in discovery metadata and use the `문서` profile.
- Deploy the pinned upstream Codex copy-install payload for `humanize-korean`. Materialize the reference tree and runtime scripts as regular files so the bundle works outside the source checkout.
- Use the common instructions to select the editor only for needed Korean document polishing. Compare changed clauses with the draft before adopting them.
- Keep upstream scratch files under an existing Git-excluded workspace or outside the repository. Run the bundled Python scripts natively on Windows.
- Allocate the run on a shared, writable filesystem path. Pass the resulting absolute run directory and interpreter through preparation, editing, and verification. Each Desktop process can have a separate temporary directory.
- Apply the new skill directories and the marked writing block to the hosts. Preserve the existing Codex configuration and other instructions when they have independent changes.

## Verification

Check skill discovery metadata, pinned source bytes, deployed file sets, and a Windows preparation and gate run.
Use a candidate that weakens an obligation to exercise the upstream check.
The runtime gate is one signal. The writing instructions require a clause-level comparison for actor, condition, exception, and obligation.
