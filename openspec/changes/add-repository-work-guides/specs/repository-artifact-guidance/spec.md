## Purpose

Guide repository file disposition so durable shared documents and reproducible test inputs remain tracked while local investigations and generated outputs stay outside Git commits.

## ADDED Requirements

### Requirement: Choose disposition by purpose
The guidance SHALL distinguish shared documentation, local review material, test source and fixtures, and generated test outputs by their purpose and the repository's existing contract.

#### Scenario: Investigation produces temporary files
- **WHEN** a review requires raw logs or working notes with no requested shared deliverable
- **THEN** the guidance places necessary files in a verified ignored local path
- **AND** useful findings can be reported without creating a tracked review document

#### Scenario: Shared specification or test baseline
- **WHEN** a document or test input is needed for ongoing collaboration or reproducibility
- **THEN** the guidance retains it under the existing tracked documentation or test structure

### Requirement: Respect Git tracking semantics
The guidance MUST distinguish Git ignore rules from package or archive exclusions and MUST check tracked or staged files when assessing remote inclusion.

#### Scenario: File was already tracked
- **WHEN** an output file is already tracked and a matching ignore pattern is added
- **THEN** the guidance recognizes that the file remains tracked
- **AND** any removal from tracking is scoped separately from historical deletion

### Requirement: Preserve repository governance ownership
The guidance MUST use an adopted repository governance contract for paths and tracked-artifact constraints without editing the separately maintained plugin.

#### Scenario: Repository defines its own output layout
- **WHEN** repo-governance or repository instructions define approved documentation and output paths
- **THEN** the guidance uses those paths rather than introducing a competing global layout

### Requirement: Deploy repository-authored skills to both profiles
The harness SHALL deploy both new skills and their complete supporting files using its existing managed application and backup mechanism.

#### Scenario: Repeated application
- **WHEN** the same source is applied twice to a supported profile
- **THEN** the second plan has no outstanding managed-file changes
- **AND** unrelated configuration and plugin files remain intact
