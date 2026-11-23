# Spec Delta

## Purpose

Provide reusable guidance for choosing and verifying typography in Korean web interfaces while preserving existing branding and application architecture and distinguishing font declarations from actual rendered Hangul glyphs.

## ADDED Requirements

### Requirement: Language-aware selection
The harness SHALL make Korean typography guidance available for automatic selection when creating or visually reviewing Korean web UI.

#### Scenario: Korean deliverable
- **WHEN** the requested interface contains Korean text
- **THEN** the model can select the guidance without an explicit skill invocation

#### Scenario: English deliverable requested in Korean
- **WHEN** a Korean-language conversation requests an English interface
- **THEN** the guidance does not force Korean fonts or change the deliverable language

### Requirement: Preserve brand and original skills
The guidance SHALL prioritize existing brand typography and project tokens and SHALL keep upstream design skills and repo-governance unchanged.

#### Scenario: Existing brand font covers Hangul
- **WHEN** a Korean interface already uses a suitable brand font
- **THEN** the model retains the family while reviewing role-specific typography

### Requirement: Verify Hangul and wrapping
The guidance SHALL distinguish actual glyph rendering from CSS font-family declarations and SHALL account for long Korean and mixed-script strings.

#### Scenario: Declared font falls back
- **WHEN** a declared font does not supply the requested Hangul glyphs
- **THEN** a successful font declaration or readiness check alone is not reported as proof of that font rendering Hangul

#### Scenario: Narrow mixed-script content
- **WHEN** Korean UI includes a long product name, URL or identifier
- **THEN** wrapping choices address overflow without forcing the same line-breaking policy on every component

### Requirement: Complete portable deployment
The harness SHALL deploy the skill and its full reference directory from the repository payload to each PC's user skill scope.

#### Scenario: Persistent state contains an older copy
- **WHEN** deployment uses persistent state
- **THEN** the current repository-owned skill is deployed with its references and repeated application converges
