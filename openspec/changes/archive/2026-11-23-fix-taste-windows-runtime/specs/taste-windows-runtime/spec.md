# Spec Delta

## Purpose

Windows에서 설치된 Chrome 또는 Edge로 원본 Taste 브라우저 검사를 실행한다.
이 기능은 원본 캐시와 저장소 규칙을 보존하면서 실행 호환만 제공한다.

## ADDED Requirements

### Requirement: Process-local browser compatibility

The runtime SHALL provide a browser path and the Edge headless compatibility flag only to the original check process and its descendants.

#### Scenario: Edge-only Windows installation
- **WHEN** a Windows host with Edge and no Chrome runs an original Taste browser check through the runtime
- **THEN** the check can discover Edge and complete its browser startup without editing the original script or persistent environment

#### Scenario: Explicit browser selection
- **WHEN** CHROME_PATH names an existing browser
- **THEN** the runtime preserves that selection and does not apply Edge-specific arguments to a different executable

### Requirement: Preserve evaluation and source

The runtime SHALL preserve the original script arguments, exit status, checks, source cache, repo-governance and test-page content.

#### Scenario: A page has design findings
- **WHEN** an unchanged page has actual gate failures after browser startup succeeds
- **THEN** the runtime returns the original failing status and findings without adding waivers or hiding checks

### Requirement: Managed autonomous deployment

The harness SHALL deploy the complete repository-owned runtime skill and its Windows routing on both managed PCs.

#### Scenario: Reapplying current source
- **WHEN** the current harness is applied twice
- **THEN** all runtime files match repository source and the second application changes no managed files
