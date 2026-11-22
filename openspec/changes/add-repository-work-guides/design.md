# Design

## Context

The installer already deploys repository-authored skills separately from imported upstream skills.
This change extends that list rather than introducing another installer or plugin.
The shared user instructions are always present, so conditional detail belongs in discoverable skills.

## Goals / Non-Goals

**Goals:** Support task-based environment decisions and file disposition on both supported PCs.
**Non-Goals:** Change application stacks, deploy application infrastructure, move existing shared history, or modify repo-governance.

## Decisions

- Use two focused skills because environment construction and repository file disposition apply to different tasks.
- Keep short autonomous routing and local-output defaults in `packages/harness/resources/common/AGENTS.md`.
- Keep runtime patterns in an optional reference loaded only for dependency and simulator work.
- Register the skills as repository-owned sources, retaining recursive deployment and existing backups.
- Prefer adopted repository governance for paths and checks; the harness supplies execution guidance where the repository has not specified it.
- Add narrow named output-directory exclusions in this repository, leaving fixtures, test baselines, OpenSpec, and maintained documents tracked.
- Verify real profiles separately from temporary-profile installer tests and independent skill behavior exercises.

## Risks / Trade-offs

- [Overbroad selection] → Task-specific descriptions and an unrelated-edit evaluation.
- [A second governance contract] → Defer file-layout constraints to adopted governance and keep this change out of its plugin.
- [Excluding reproducible inputs] → Avoid extension-wide ignores and treat approved snapshots and fixtures as source.
- [Claims beyond evidence] → Record installed content, simulated behavior, and actual Desktop selection as separate observations.

## Migration Plan

Validate source and temporary-profile behavior, preview each real profile, and apply only expected instruction/skill changes.
Retain existing dependency versions and use the installer's normal backups.
Remove only this task's ignored fixtures after verification.
