# Author OpenSpec artifacts

Read the resolved root's `openspec/config.yaml` or `config.yml`, along with the relevant specs and active changes.
Reuse a matching active change.
For a new change, derive its name from the requested behavior and run `openspec new change <name> --json` in the confirmed root or selected store.
Use the configured schema unless the user requests a different one.

Use `openspec status --change <name> --json` to find artifact dependencies and output locations.
Run `openspec instructions <artifact-id> --change <name> --json` for each artifact you need to author.
Follow the returned template, constraints, and dependency paths.
Keep artifacts within the change's resolved output paths.
For a glob output, choose a matching concrete path within the change.

Ground requirements and design in the relevant implementation and tests.
Reuse existing capability paths and express behavior as observable scenarios.
Write the schema's required artifacts in dependency order and keep them proportional to the requested change.
Use a schema-supported skip only when its condition applies.
Treat file-existence status as progress tracking and assess artifact contents against the requested behavior.

Resolve ambiguity that materially affects behavior, compatibility, or scope with the user.
Record routine implementation choices and continue within the existing authorization.
