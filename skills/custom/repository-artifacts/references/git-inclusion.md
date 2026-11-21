# Git inclusion checks

## Choose or verify an output exclusion

- Use `git ls-files -- <path>` to check for tracked entries and `git check-ignore -v -- <path>` to verify the effective ignore rule for untracked output.
  Add `--no-index` to diagnose a rule for a tracked path.
- An ignore rule leaves existing tracked entries in place.
  If removing a file from tracking is within scope, preserve needed local content and inspect the resulting staged change.

## Review a specific artifact in staged or outgoing changes

- Use `git status --short -- <path>` for context.
  Inspect staged changes with `git diff --cached --name-status -- <path>` and `git diff --cached -- <path>`.
  Use `git ls-files --stage -- <path>` to check what is in the index, including entries with no staged diff.
  Explicit staging can include ignored paths, and ignore rules provide no access control.
- If earlier outgoing commits may contain the artifact, inspect the commits the push would introduce for that path.
  For an existing destination branch, use `git log --full-history --diff-merges=separate --name-status <remote-tip>..<source-tip> -- <path>` with the intended remote and source tips.
  Removing a file from the current tree leaves earlier commits intact.
  Preserve published history during routine cleanup.

## Official references

- [Git ignore semantics](https://git-scm.com/docs/gitignore)
- [Git check-ignore](https://git-scm.com/docs/git-check-ignore)
- [npm package file selection](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files)
