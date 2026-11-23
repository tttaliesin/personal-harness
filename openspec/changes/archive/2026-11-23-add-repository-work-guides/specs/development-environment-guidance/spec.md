## Purpose

Guide reproducible repository-owned development and test environments while preserving the existing stack and choosing infrastructure only when the task needs it.

## ADDED Requirements

### Requirement: Select guidance for relevant environment work
The harness SHALL make development-environment guidance available for autonomous selection when establishing or repairing run/test environments.

#### Scenario: Environment setup without a skill name
- **WHEN** a user requests a reproducible local run or integration-test environment
- **THEN** the guidance is available without an explicit skill invocation

#### Scenario: Unrelated small edit
- **WHEN** a task does not require environment changes
- **THEN** the guidance does not require infrastructure setup or a simulator run

### Requirement: Preserve the repository contract
The guidance MUST preserve existing frameworks, runtime versions, architecture, command runners, and repository governance unless the user authorizes their change.

#### Scenario: Native Windows service with external dependencies
- **WHEN** an existing Windows service needs local integration testing
- **THEN** the guidance keeps the service on its required host and considers containers only for compatible dependencies
- **AND** it does not retarget the service or infer that a mock verifies Windows service lifecycle behavior

### Requirement: Verify the relevant environment boundary
The guidance SHALL distinguish real dependencies from simulated boundaries and verify the requested startup, test, and cleanup behavior using isolated resources.

#### Scenario: Dependency simulator is useful
- **WHEN** an unavailable external dependency prevents a relevant integration scenario
- **THEN** the guidance allows a scoped deterministic simulator
- **AND** the report identifies the simulated boundary and the behavior actually exercised
