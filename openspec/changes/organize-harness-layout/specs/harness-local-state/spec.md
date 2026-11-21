# Spec Delta

## Purpose

각 PC에서 선택한 Codex 설정을 보존한다.
하네스가 실제로 설치한 의존성의 버전과 출처를 PC별 상태에 기록한다.

## ADDED Requirements

### Requirement: Preserve machine-local Codex preferences

공통 설정 병합은 `model`, `model_reasoning_effort`, `desktop.composer-predictions-enabled`를 PC별 설정으로 유지해야 한다(MUST).

#### Scenario: Preserve existing choices

- **WHEN** 기존 Codex 프로필에 세 설정이 있고 PC별 TOML에 덮어쓰기가 없다.
- **THEN** 적용 후에도 기존 모델, 추론 수준, 입력 제안 값이 유지된다.

#### Scenario: Honor explicit local overrides

- **WHEN** PC별 TOML의 `[config]`에 `model` 또는 `model_reasoning_effort`를 지정하거나 `[config.desktop]`에 `composer-predictions-enabled`를 지정한다.
- **THEN** 적용은 명시한 키에 PC별 값을 사용한다.

#### Scenario: Leave an unset preference unset

- **WHEN** 기존 프로필과 PC별 TOML에 해당 키가 모두 없다.
- **THEN** 공통 설정 적용은 해당 키를 추가하지 않는다.

### Requirement: Record installed dependencies in the selected state root

일반 및 잠금 설치는 활성 잠금을 선택한 상태 루트의 `sources/dependencies.lock.json`에 기록해야 한다(MUST).
저장소의 `dependencies/dependencies.lock.json`은 읽기 전용 초기값으로 사용해야 한다(MUST).

#### Scenario: Install from a checkout with the default state root

- **WHEN** 체크아웃에서 상태 루트를 지정하지 않고 의존성 설치를 완료한다.
- **THEN** 설치한 버전과 커밋, 배포 해시를 `.local/sources/dependencies.lock.json`에 기록한다.
- **AND** 저장소에 추적한 초기값은 보존한다.

#### Scenario: Install into an explicit state root

- **WHEN** 선택한 상태 루트에 의존성 설치를 완료한다.
- **THEN** 해당 상태 루트의 `sources/dependencies.lock.json`에 활성 잠금을 기록한다.

### Requirement: Resolve dependency locks for offline harness operations

계획·검사·적용은 상태 루트에 있는 활성 잠금을 우선 사용해야 한다(MUST).
활성 잠금이 없으면 상태 루트를 명시하지 않은 체크아웃에 한해 저장소의 초기값을 사용해야 한다(MUST).

#### Scenario: An active lock differs from the seed

- **WHEN** 활성 잠금이 저장소 초기값과 다르다.
- **THEN** `task plan`, `task check`, `task apply`는 활성 잠금의 의존성을 검사한다.

#### Scenario: A legacy checkout has no active lock

- **WHEN** 기본 체크아웃에 활성 잠금이 아직 없다.
- **THEN** `task plan`, `task check`, `task apply`는 저장소의 초기값으로 의존성을 검사한다.
- **AND** 세 명령은 활성 잠금을 생성하지 않는다.

#### Scenario: The explicitly selected state has no active lock

- **WHEN** 상태 루트를 명시해 계획·검사·적용을 실행하지만 해당 상태 루트에 활성 잠금이 없다.
- **THEN** 세 명령은 활성 잠금이 없다고 보고하고 0이 아닌 종료 코드를 반환한다.
- **AND** 적용은 사용자 파일을 쓰기 전에 중단한다.
