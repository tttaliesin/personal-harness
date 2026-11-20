---
name: repository-artifacts
description: Choose tracked or local-only locations for repository documents, review notes, test assets and generated outputs; configure relevant exclusions and inspect commit contents. Select when creating these files, changing test output paths, or preparing commits, without requiring a separate audit for ordinary read-only work.
---

# Repository documents and generated output

Use the purpose and maintenance needs of a file to decide whether it belongs in Git.
Select this skill autonomously when the task creates documents or artifacts, changes output configuration, or prepares a commit.

## Resolve the repository's rules

Read the relevant repository instructions, adopted repo-governance contract, document layout, ignore files, and test-output configuration.
Use their approved paths and exceptions before choosing a fallback.
Installing this skill does not adopt a repository into repo-governance.
If adopted governance reports an unresolved contract or blocks a governed operation, follow its resolution path rather than bypassing it with these defaults.
Preserve existing OpenSpec roots and schema-owned artifact paths.
Do not edit a plugin, introduce hooks, or establish a competing governance contract to handle file disposition.

## Classify by purpose

| Material | Default disposition |
|---|---|
| Maintained README, development/operations guide, architecture, API contract | Shared, tracked under the existing document layout |
| Adopted design decision, requested shared review, OpenSpec artifact | Shared, tracked according to the repository's lifecycle |
| Working notes, investigation drafts, raw diagnostic captures | Local-only when no shared deliverable was requested |
| Test code, fixtures, simulator scenarios, approved snapshot/golden baselines | Tracked reproducible inputs |
| Test logs, coverage, traces, actual/diff screenshots, temporary databases | Generated local output or intentional CI artifacts |

Do not create a review document just to save a conversational answer.
If investigation files are useful, place them in an existing ignored local area.
When no convention exists, consider `.local/reviews/` for notes and `.local/artifacts/` for outputs.
Verify the chosen path with `git check-ignore -v -- <path>` before relying on it.
For a new shared repository convention within the task scope, add a narrow root `.gitignore` rule and verify it.
Use `.git/info/exclude` for a purely personal local exception when a shared rule is inappropriate.
If no suitable ignore rule can be established within scope, use an outside-repository temporary directory.

Keep durable findings and necessary evidence in a maintained shared document when that is the requested outcome.
Raw logs do not need to accompany every shared conclusion.
Do not move or discard existing tracked review/history documents solely because their names suggest temporary work.

## Configure output without losing source

Identify the test tool's real output paths and any intentional CI upload paths.
Prefer its existing configuration or a narrow output-directory rule.
Keep source, fixtures, approved baselines, and executable source directories tracked.
Do not use broad extension rules such as ignoring all Markdown, JSON, PNG, or ZIP files.
Do not ignore every `bin/` directory without checking whether it contains source entry points.
Git exclusion and CI artifact retention are separate decisions.

## Check commit and remote inclusion

Inspect `git status --short`, staged names and diffs when preparing a commit.
Check suspected outputs with `git ls-files -- <path>` and `git check-ignore -v --no-index -- <path>`.
An ignore rule does not remove an already tracked file.
If removing it from tracking is within the requested scope, preserve needed local content and inspect the resulting staged change.
Removing a file from the current tree does not erase earlier commits.
When preparing a push, check the outgoing commits if earlier commits may contain the identified artifact.
Do not rewrite published history as routine cleanup.

Package allowlists, `.npmignore`, and archive exclusions control their own deliverables.
They do not prevent tracked content from reaching a Git remote.
An ignored path is not an access-control boundary and can still be explicitly included; inspect the actual staged contents.

## Finish and retain deliberately

Keep generated evidence needed for the active investigation until verification is complete.
Remove only disposable files, temporary chats, and resources created for the task when cleanup is part of the workflow.
Verify absolute cleanup targets before deletion and preserve unrelated files and normal managed backups.
Report a concise durable conclusion and distinguish any retained local evidence from tracked deliverables.

Official references:
- [Git ignore semantics](https://git-scm.com/docs/gitignore)
- [Git check-ignore](https://git-scm.com/docs/git-check-ignore)
- [npm package file selection](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files)
