# Spec Delta

## Purpose

Provide the original Taste Skill as a reproducibly installed frontend design capability that the model can select from the user's task while preserving existing application architecture and repository governance.

## ADDED Requirements

### Requirement: Original managed installation
The harness SHALL install the official Taste Skill plugin at a recorded stable release commit and verify the complete installed source against that commit.

#### Scenario: Install the registered release
- **WHEN** the user installs or updates the registered Taste Skill plugin
- **THEN** both PCs receive the original skill, references, scripts and assets without local modifications

#### Scenario: Reject a different source
- **WHEN** installed plugin content differs from the selected source commit
- **THEN** verification fails instead of reporting a successful original installation

### Requirement: Autonomous design selection
The model SHALL be allowed to select `design-taste-frontend` for requested site creation or visual design work without an explicit skill invocation.

#### Scenario: Request a site design
- **WHEN** the user requests a site or visual redesign and the skill's workflow fits the outcome
- **THEN** the model can use Taste Skill without asking the user to name it

### Requirement: Preserve existing project architecture
Selecting the design skill SHALL preserve the existing project's stack, rendering mode, application behavior, deployment path and repository governance.

#### Scenario: Work on a server-rendered application
- **WHEN** the model selects Taste Skill in an existing server-rendered project
- **THEN** it retains server rendering and existing application interfaces instead of converting the project to static export

#### Scenario: Preserve governance
- **WHEN** Taste Skill is installed or used for visual work
- **THEN** existing repo-governance files and settings remain unchanged

### Requirement: Reproducible project registration
The project SHALL record the plugin declaration, exact revision and source digest so future installation follows the registered policy.

#### Scenario: Reapply recorded dependencies
- **WHEN** a PC installs the current lock
- **THEN** the recorded Taste Skill version and source digest determine the selected plugin
