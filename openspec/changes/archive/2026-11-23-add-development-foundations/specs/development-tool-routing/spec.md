# Spec Delta

## Purpose

Provide reproducible access to code relationships and persistent development requirements across managed PCs while preserving the user's authorization and existing repository governance.

## ADDED Requirements

### Requirement: Managed OpenSpec installation
The harness SHALL install the official OpenSpec CLI at an exact recorded version and verify its package identity and integrity before selecting it.

#### Scenario: Install a resolved release
- **WHEN** an ordinary dependency update resolves a stable OpenSpec release
- **THEN** the harness installs it in managed local state and records its version and integrity

#### Scenario: Reject an inconsistent installation
- **WHEN** the installed package identity, version, integrity, or declared executable differs from the selected record
- **THEN** the operation fails without publishing a successful dependency lock

### Requirement: Legacy locked replay
The harness SHALL replay a lock without OpenSpec without silently adding OpenSpec or requiring its CLI and skill.

#### Scenario: Replay an earlier lock
- **WHEN** the user requests locked installation using a record without OpenSpec
- **THEN** the existing dependency set is replayed without a latest OpenSpec lookup

### Requirement: Autonomous task selection
The harness SHALL permit the model to select CodeGraph for useful code relationships and OpenSpec for persistent requirements without an explicit skill invocation.

#### Scenario: Read a known file
- **WHEN** a request can be answered by reading a known file or searching exact text
- **THEN** the model can perform that operation without a preceding graph or specification workflow

#### Scenario: Continue an authorized implementation
- **WHEN** a development request authorizes implementation and the selected OpenSpec artifacts are ready
- **THEN** the model can continue implementation and verification without a new request solely to leave planning

### Requirement: Repository adoption scope
The workflow SHALL use resolved OpenSpec roots and schema output paths and SHALL initialize a repository only when adopting OpenSpec there is within the user's request.

#### Scenario: Work outside an initialized project
- **WHEN** the model considers OpenSpec for ordinary work in a repository without a root and adoption was not requested
- **THEN** it continues the requested work without creating OpenSpec files or asking an unrelated setup question

#### Scenario: Resolve an existing root
- **WHEN** the CLI resolves a parent repository or selected store
- **THEN** the workflow uses that context and its returned artifact paths

### Requirement: Preserve local integrations
Applying the development tools SHALL preserve existing configuration, hooks, repo-governance files, and private executable overrides.

#### Scenario: Apply to a PC with existing governance
- **WHEN** development tool guidance and the OpenSpec adapter are applied
- **THEN** existing hook definitions and trust, runtime settings, and repo-governance files remain unchanged

#### Scenario: Use a private executable override
- **WHEN** the PC already declares its own OpenSpec executable path
- **THEN** installation retains that override
