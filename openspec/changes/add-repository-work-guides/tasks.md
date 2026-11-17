# Tasks

## 1. Guidance and ownership

- [x] 1.1 Author two focused skills and common autonomous routing; inspect descriptions and runtime preservation boundaries.
- [x] 1.2 Review current repo-governance ownership and document a compatible split without modifying its plugin; linked design thread confirms file inclusion/exclusion and worktree adoption boundaries.
- [x] 1.3 Document maintained vs local artifacts and add narrow test-output exclusions; verify representative Git ignore behavior.

## 2. Managed deployment integration

- [x] 2.1 Register both repository-authored skills and extend temporary-profile fixtures to include complete reference deployment.
- [x] 2.2 Validate skill metadata, OpenSpec, and the required root `task test` suite; 306 executed, 304 passed, 2 environment skips, zero failures.
- [x] 2.3 Exercise independent environment, artifact, and unrelated-edit scenarios; relevant bodies were read, net48 remained native, tracked output was handled separately, and an ordinary typo required no environment setup. Native service execution was not claimed.

## 3. Two-host integration

- [x] 3.1 Preview and apply expected instruction/skill changes on Homelab and Roylabs; both subsequent `task check` commands report zero files and zero missing prerequisites.
- [x] 3.2 Verify preserved configuration, dependency locks, host overrides, and Roylabs repo-governance's 56 file hashes; remove task-created fixtures on both PCs and confirm staged files contain no local evidence or generated test outputs.
