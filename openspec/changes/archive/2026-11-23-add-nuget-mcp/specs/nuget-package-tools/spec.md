# NuGet package tools

## Purpose

Provide the official NuGet package tools on both managed Windows PCs with reproducible installation and autonomous task selection while retaining each existing project's .NET configuration.

## ADDED Requirements

### Requirement: Reproducible official installation
The harness SHALL install and register the official NuGet MCP server from an exact package recipe with verified package and .NET runtime artifacts.

#### Scenario: Apply to a PC without the SDK
- **WHEN** the authorized install runs on a managed Windows x64 PC without .NET 10 SDK
- **THEN** the harness installs its own execution environment and registers the stdio server using generated local paths
- **AND** a subsequent check succeeds when the managed installation matches its receipt

#### Scenario: Detect a changed installation
- **WHEN** a managed package file is removed or modified
- **THEN** the next check reports the missing or changed artifact

### Requirement: Project runtime preservation
Installing or selecting the MCP SHALL preserve existing project target frameworks, SDK declarations, package feeds, authentication, deployment rules and repo-governance.

#### Scenario: Package work in an existing project
- **WHEN** a package task uses the NuGet MCP
- **THEN** the project's existing .NET version and SDK declarations remain unchanged unless that change was separately requested
- **AND** the MCP's execution environment does not change the machine's global PATH or .NET registrations

### Requirement: Autonomous scoped selection
The deployed user instructions SHALL allow autonomous selection for C# package tasks needing actual feed or dependency graph information without making it a prerequisite for all C# work.

#### Scenario: Version information is needed
- **WHEN** a C# package task needs current versions or compatibility information
- **THEN** the model can select the NuGet tools without an explicit tool invocation by the user

#### Scenario: The service cannot answer
- **WHEN** the tool fails or lacks required project context
- **THEN** work continues with available official sources and relevant CLI checks while reporting the unverified scope

### Requirement: Actual execution evidence
The deployment record SHALL distinguish installer tests, actual PC application and successful MCP calls.

#### Scenario: Verify both installations
- **WHEN** deployment is reported complete
- **THEN** each PC has completed MCP initialization, tool discovery and an actual read-only package query
- **AND** the record states the scope of any autonomous-selection test
