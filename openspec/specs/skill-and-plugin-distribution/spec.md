# 단독 스킬과 외부 리소스 배포

## Purpose

이 저장소가 유지하는 단독 스킬을 표준 `skills` CLI와 Codex 마켓플레이스에서 설치할 수 있게 한다.
외부 리소스는 원본과 갱신 기준을 확인할 수 있게 기록한다.

## Requirements

### Requirement: Install the same standalone skills through both distribution paths

자체 스킬은 `skills/custom/`에, 외부 도구와 규격을 연결하는 어댑터는 `skills/adapters/`에 유지해야 한다(MUST).
같은 스킬의 `SKILL.md`와 동반 파일은 두 설치 경로에서 같은 원본을 사용해야 한다(MUST).

#### Scenario: 표준 CLI로 단독 스킬 설치

- **WHEN** 사용자가 저장소의 `skills/`를 표준 `skills` CLI의 설치 원본으로 지정한다.
- **THEN** CLI는 두 디렉터리의 스킬에서 사용자가 선택한 스킬과 필요한 동반 파일을 설치할 수 있다.
- **AND** 사용자는 CLI가 지원하는 에이전트와 설치 범위를 선택할 수 있다.

#### Scenario: Codex에서 자체 스킬과 어댑터를 따로 설치

- **WHEN** 사용자가 `personal-harness-skills` 또는 `personal-harness-adapters` 중 하나를 설치한다.
- **THEN** Codex는 선택한 번들의 매니페스트가 나열한 스킬을 해당 번들의 버전으로 설치한다.
- **AND** 각 `.codex-plugin/plugin.json`의 `skills` 항목은 소속 스킬 디렉터리를 번들 루트에 대한 상대 경로로 명시한다.

### Requirement: Record external resource sources and update criteria

외부 스킬, 참조 자료, 플러그인, MCP 서버와 CLI의 공식 출처와 선택 기준은 `external-resources.toml`에서 확인할 수 있어야 한다(MUST).
각 리소스는 해당 출처의 설치 및 갱신 절차를 사용해야 한다(MUST).

#### Scenario: 외부 리소스 또는 어댑터의 의존성 확인

- **WHEN** 사용자가 외부 리소스의 원본 또는 어댑터의 선행 도구를 확인한다.
- **THEN** 매니페스트와 외부 리소스 안내에서 해당 원본, 설치에 필요한 경로 또는 패키지 식별자와 갱신 기준을 찾을 수 있다.
- **AND** 외부 원본의 파일과 각 환경의 접속·사용자 설정은 해당 원본 및 환경에서 관리한다.

### Requirement: Verify publicly distributed content from the repository

저장소 루트의 배포 검사는 카탈로그가 가리키는 실제 파일과 각 패키지의 버전 및 필수 파일을 대조해야 한다(MUST).
검사는 저장소의 배포 자료를 대상으로 수행해야 한다(MUST).

#### Scenario: 단독 스킬 번들의 매니페스트 검증

- **WHEN** 유지 파일과 카탈로그를 대상으로 `npm test`를 실행한다.
- **THEN** 검사는 두 단독 스킬 번들의 경로, 각각의 매니페스트와 실제 스킬 목록을 대조한다.
- **AND** 스킬이 없는 경로나 다른 번들의 스킬을 가리킨 매니페스트는 검증을 통과하지 못한다.

## 근거

[공개 설치 안내](../../../README.md#단독-스킬-설치) · [번들 배포](../../../docs/deployment.md#단독-스킬-번들) · [외부 리소스 목록](../../../external-resources.toml) · [배포 검사](../../../tests/distribution.test.mjs)
