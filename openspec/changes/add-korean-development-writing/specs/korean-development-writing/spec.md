# Korean development writing

## Purpose

Provide consistent guidance for drafting Korean development documents and preserve their operational meaning when polishing prose.

## ADDED Requirements

### Requirement: STE-KO for Korean development documents

The harness SHALL deploy the STE-KO document guidance and pinned references on both Windows profiles.
It SHALL select the document guidance for Korean development documents and honor the repository's established document rules.

#### Scenario: Author a Korean procedure

- **WHEN** the user requests a Korean README, technical specification, operations procedure, or development policy
- **THEN** the agent selects the STE-KO document rules autonomously and writes conditions and actors explicitly.

#### Scenario: Handle unrelated work

- **WHEN** the work is ordinary chat, code editing, UI copy, or a document in another language
- **THEN** this document workflow stays inactive unless a Korean development document is part of the requested deliverable.

### Requirement: Optional meaning-preserving polishing

The harness SHALL make the pinned Codex `humanize-korean` skill available for autonomous selection when a Korean development document needs polishing.
It SHALL exclude STE80 from this workflow and keep editor artefacts local.

#### Scenario: Polish a draft that needs editing

- **WHEN** translationese or mechanical phrasing remains in a Korean development document
- **THEN** the agent can select the editor without a named invocation and compare each changed clause with the original for actor, action, condition, exception, obligation, permission, and prohibition.

#### Scenario: Preserve a clause with an uncertain rewrite

- **WHEN** a candidate weakens an obligation, changes its scope, or cannot be shown to preserve the original meaning
- **THEN** the agent keeps the earlier wording for the affected clause.

#### Scenario: Keep an already clear document

- **WHEN** the document needs no polishing
- **THEN** the agent completes the work without the editor workflow.
