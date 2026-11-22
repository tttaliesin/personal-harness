---
name: development-environment
description: Set up, repair, or document reproducible repository run and integration-test environments. Also use for focused Compose dependency work, native C# and Windows service checks, or external-service simulator design.
---

# Repository development environments

Read the references that match the requested work.

- For Compose dependency orchestration, read [Compose dependencies](references/compose-dependencies.md).
- For native C# integration tests or Windows service checks, read [native service checks](references/native-service-checks.md).
- For external boundary design and deterministic test responses, read [external-service simulators](references/external-service-simulators.md).

For a simulator-only request, work within the requested external boundary.
Use Deployment Simulator and other simulators on demand when the scenario needs them.

## Environment workflow

Use this workflow only when the requested outcome needs a run or test environment set up, repaired, or documented.

### Establish the existing contract

Read relevant repository instructions, development docs, manifests and locks, runtime declarations, existing command runners, Compose files, CI jobs, and test configuration.
Use the actual target runtime and operating system.
Keep existing architecture, frameworks, dependency versions, SDK/TFM declarations, deployment paths, and repo-governance rules.
Environment work does not itself authorize migrations or installing unrelated tools.

Repair the smallest missing part needed by the requested scenario.
Use existing run/test commands when they already work.
Keep infrastructure orchestration separate from application architecture; a local dependency does not require a new application layer or directory migration.

Run the system under test through its actual application code.
Consider existing test-managed containers for ephemeral integration dependencies.

### Maintain a usable entry point

Expose setup, start/readiness, test, reset, and stop through the existing command runner when those operations are needed.
Add only the commands and directories the scenario uses.
Follow the existing layout for Compose configuration, infrastructure assets, simulators, and test scenarios.
Folder names such as `infra/`, `simulators/`, and `tests/integration/` are examples rather than a mandatory root template.

Put maintained setup instructions in the existing shared development guide, or create one when the task needs a persistent guide.
Document required versions, example configuration without credentials, startup/readiness, test invocation, state reset, cleanup, and the boundaries that remain external.
Use ignored local paths for raw diagnostic output and generated reports according to repository rules.

### Verify the requested outcome

Check startup and readiness before the relevant integration test.
Use isolated test data, ports, and resource names where simultaneous or repeated runs would collide.
Reset and cleanup only resources created for this task; preserve unrelated containers, volumes, services, and user data.
Exercise failure or recovery scenarios when they are part of the requested behavior.
Report commands and observed outcomes, including simulated boundaries and checks that could not run.
Keep a proposed environment, a successful configuration parse, an executed local test, and deployment verification distinct.
