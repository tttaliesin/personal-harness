# Spec Delta

## Purpose

유지하는 단독 스킬과 자체 플러그인의 배포 경로를 제공한다.
외부 리소스의 출처와 실제 공개 배포 파일을 확인할 수 있게 한다.

## ADDED Requirements

### Requirement: Install standalone skills through the standard skills CLI

유지하는 단독 스킬은 표준 `skills` CLI가 찾을 수 있는 `skills/` 경로로 배포해야 한다(MUST).

#### Scenario: 단독 스킬 설치

- **WHEN** 사용자가 표준 `skills` CLI로 저장소의 `skills/`를 설치 원본으로 선택한다.
- **THEN** 각 단독 스킬의 `SKILL.md`와 배포에 필요한 로컬 참조 및 스크립트를 설치할 수 있다.
- **AND** 자체 플러그인의 번들 스킬은 별도 Codex 카탈로그를 통해 설치한다.

### Requirement: Publish owned plugins through the existing catalog

공개 카탈로그는 자체 플러그인의 유지하는 설치 경로와 배포 버전을 가리켜야 한다(MUST).

#### Scenario: 기존 공개 플러그인 설치

- **WHEN** 사용자가 `personal-harness` 마켓플레이스를 등록한다.
- **THEN** repo-governance `0.2.0`, Windows Agent Devkit `0.3.5`, Worker Orchestrator `0.1.6`을 기존 경로에서 찾는다.
- **AND** Devkit와 Worker의 승인된 공개 파일은 기존 배포본과 바이트 단위로 일치한다.

### Requirement: Record external resource sources

외부 리소스는 공개 출처와 해당 리소스의 갱신 기준을 별도로 기록해야 한다(MUST).

#### Scenario: 외부 원본 확인

- **WHEN** 사용자가 등록한 외부 스킬, 플러그인, MCP 또는 도구의 출처를 찾는다.
- **THEN** `external-resources.toml`에서 권위 원본 또는 패키지 이름과 해당 출처의 선택 기준을 확인할 수 있다.

### Requirement: Verify distribution without a profile installer

저장소는 사용자 프로필 적용 없이 공개 배포 파일을 검사할 수 있어야 한다(MUST).

#### Scenario: 배포 파일 확인

- **WHEN** 저장소 루트에서 `npm test`를 실행한다.
- **THEN** 카탈로그가 가리키는 패키지의 식별자와 실제 파일을 대조한다.
- **AND** 검사에 사용할 Python 가상환경이나 Codex 사용자 설정을 준비할 필요가 없다.
