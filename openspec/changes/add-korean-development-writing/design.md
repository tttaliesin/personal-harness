# Design

## Context

The harness deploys local skills and cached upstream files to each user's agent skills directory.
Both Windows hosts already have Codex profiles that retain their own settings and plugins.

## Decisions

- Keep the document-scoped `ste-ko` entrypoint under `packages/harness/resources/skills/adapters/ste-ko/`.
  Make the scope clear in discovery metadata and use the `문서` profile.
- Fetch the declared STE-KO reference documents from the upstream default branch during ordinary installation and update.
- Fetch the `humanize-korean` Codex copy-install payload from the latest stable upstream GitHub release.
  Map the original references and runtime scripts to the paths used by the entrypoint.
- Deploy the validated files from the local external skill cache.
  Locked installation uses an existing cache that matches the current registry declarations.
- Use the common instructions to select the editor only for needed Korean document polishing. Compare changed clauses with the draft before adopting them.
- Keep upstream scratch files under an existing Git-excluded workspace or outside the repository. Run the bundled Python scripts natively on Windows.
- Allocate the run on a shared, writable filesystem path. Pass the resulting absolute run directory and interpreter through preparation, editing, and verification. Each Desktop process can have a separate temporary directory.
- Apply the new skill directories and the marked writing block to the hosts. Preserve the existing Codex configuration and other instructions when they have independent changes.

## Verification

Check skill discovery metadata, cached bytes against the selected commits, and the deployed file sets.
Run Windows preparation and the upstream gate.
Use a candidate that weakens an obligation to exercise the upstream check.
The runtime gate is one signal. The writing instructions require a clause-level comparison for actor, condition, exception, and obligation.
