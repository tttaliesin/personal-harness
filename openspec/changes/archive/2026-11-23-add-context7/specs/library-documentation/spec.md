# Library documentation

## Purpose

두 PC에서 공식 Context7 원본을 같은 기준으로 설치해 라이브러리와 버전에 맞는 자료를 조회한다.
모델은 작업에 필요한 때 자율 선택하며 문서 서비스의 실패가 독립적인 개발 작업을 막지 않도록 한다.

## ADDED Requirements

### Requirement: Reproducible official distribution

The harness SHALL install the complete official Context7 Codex plugin on both supported hosts from a recorded commit and content digest.

#### Scenario: Install on either supported PC

- **WHEN** the authorized installation runs on Homelab or Roylabs
- **THEN** the enabled plugin matches its locked official manifest and source digest
- **AND** account credentials, runtime state, hook trust and repo-governance are preserved

### Requirement: Autonomous selective documentation lookup

The agent SHALL select Context7 without an explicit invocation when library or version-specific documentation is useful for the task.

#### Scenario: Version-specific API uncertainty

- **WHEN** an implementation requires checking an external library API
- **THEN** the agent identifies the actual dependency and version and uses relevant available documentation

#### Scenario: Independent local work

- **WHEN** direct reads or a small mechanical edit provide sufficient evidence
- **THEN** Context7 is not a prerequisite for proceeding

### Requirement: Truthful availability and fallback

The harness SHALL report installation, authentication and actual documentation retrieval separately.

#### Scenario: Authentication or retrieval is unavailable

- **WHEN** Context7 requires login, reaches a limit or lacks the required version
- **THEN** the agent reports that limit and continues suitable direct source or official documentation checks
- **AND** it does not claim a successful lookup
