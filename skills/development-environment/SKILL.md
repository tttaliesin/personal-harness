---
name: development-environment
description: Establish, repair, or document reproducible repository run and test environments, including dependency infrastructure and relevant external-service simulators. Select for environment work or missing setup needed by the requested implementation; ordinary edits with a working environment do not require it.
---

# Repository development environments

Make the requested run or test scenario reproducible using the repository's existing stack.
Select this skill autonomously when its environment guidance helps the task.

## Establish the existing contract

Read relevant repository instructions, development docs, manifests and locks, runtime declarations, existing command runners, Compose files, CI jobs, and test configuration.
Use the actual target runtime and operating system.
Keep existing architecture, frameworks, dependency versions, SDK/TFM declarations, deployment paths, and repo-governance rules.
Environment work does not itself authorize migrations or installing unrelated tools.

Repair the smallest missing part needed by the requested scenario.
Use existing run/test commands when they already work.
Keep infrastructure orchestration separate from application architecture; a local dependency does not require a new application layer or directory migration.

## Choose the required runtime boundary

- Run the system under test through its actual application code.
- Use Compose for compatible shared local dependencies when that fits the repository.
- Consider existing test-managed containers for ephemeral integration dependencies.
- Keep native Windows services or .NET Framework components on a compatible Windows host when their behavior requires it.
- Build a simulator only for a relevant external boundary that cannot reasonably be exercised directly or needs deterministic failures.

For dependency orchestration, native service testing, or simulator design, read [runtime patterns](references/runtime-patterns.md).
Deployment Simulator and other simulators remain on-demand tools; routine edits and unit tests do not automatically trigger them.

## Maintain a usable entry point

Expose setup, start/readiness, test, reset, and stop through the existing command runner when those operations are needed.
Add only the commands and directories the scenario uses.
Follow the existing layout for Compose configuration, infrastructure assets, simulators, and test scenarios.
Folder names such as `infra/`, `simulators/`, and `tests/integration/` are examples rather than a mandatory root template.

Put maintained setup instructions in the existing shared development guide, or create one when the task needs a persistent guide.
Document required versions, example configuration without credentials, startup/readiness, test invocation, state reset, cleanup, and the boundaries that remain external.
Use ignored local paths for raw diagnostic output and generated reports according to repository rules.

## Verify the requested outcome

Check startup and readiness before the relevant integration test.
Use isolated test data, ports, and resource names where simultaneous or repeated runs would collide.
Reset and cleanup only resources created for this task; preserve unrelated containers, volumes, services, and user data.
Exercise failure or recovery scenarios when they are part of the requested behavior.
Report commands and observed outcomes, including simulated boundaries and checks that could not run.
Keep a proposed environment, a successful configuration parse, an executed local test, and deployment verification distinct.
