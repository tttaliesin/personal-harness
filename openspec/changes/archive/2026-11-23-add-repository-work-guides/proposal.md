# Proposal

## Why

The harness lacks reusable guidance for reproducible development environments and for separating shared source documentation from local review material and generated test output.
Existing ignore and package rules cover selected paths but do not supply task-based decisions across repositories.

## What Changes

- Add autonomously selected `development-environment` and `repository-artifacts` skills.
- Preserve each repository's stack, runtime versions, command runner, architecture, and governance contract.
- Register both skills in the existing installer and document their ownership boundary with repo-governance.
- Ignore named generated test-output directories in this harness repository while retaining test source and fixtures.
- Apply and verify the guidance on Homelab and Roylabs without changing repo-governance.

## Capabilities

### New Capabilities

- `development-environment-guidance`: Task-based guidance for repository-owned run/test environments and relevant simulators.
- `repository-artifact-guidance`: Task-based disposition of shared documents, local investigation material, and generated test outputs.

### Modified Capabilities

None.

## Impact

Changes affect repository-authored skills, common routing instructions, installer skill registration, its temporary-profile fixtures, and maintained documentation.
No new plugin, MCP, runtime dependency, automatic hook, or mandatory development gate is introduced.
Application repositories and the separately maintained repo-governance plugin remain outside the write scope.
