# Spec Delta

## Purpose

저장소에 등록한 로컬 원본과 외부 원본을 사용자 스킬로 설치한다.
사용자 프로필은 원본의 역할에 관계없이 같은 경로에서 스킬을 찾는다.

## ADDED Requirements

### Requirement: Deploy registered standalone skills

개인 하네스 설치기는 등록된 로컬 스킬 파일과 검증한 외부 스킬 파일을 `~/.agents/skills/<name>/`에 배포해야 한다(MUST).

#### Scenario: Register a skill in a grouped source directory

- **WHEN** 배포 목록에 유효한 스킬 디렉터리를 등록한다.
- **THEN** 계획은 그 디렉터리의 파일을 `~/.agents/skills/<name>/`에 배치할 대상으로 표시한다.
- **AND** 적용은 파일을 계획한 위치에 복사한다.
- **AND** 스킬 내부의 상대 경로를 보존한다.

#### Scenario: Deploy the contents of an upstream directory

- **WHEN** 외부 스킬의 `files`에 `"."`을 대상으로 하는 디렉터리 매핑을 지정하고 해당 파일을 캐시했다.
- **THEN** 적용은 원본 디렉터리의 내용 전체를 `~/.agents/skills/<name>/`에 배치한다.
- **AND** 디렉터리 내부의 상대 경로를 보존한다.

#### Scenario: Assemble an adapter with upstream references

- **WHEN** `ste-ko`를 배포하고 등록된 외부 참조 자료가 캐시에 있다.
- **THEN** 적용은 로컬 `SKILL.md`를 `~/.agents/skills/ste-ko/`에 배치한다.
- **AND** 외부 파일을 `files`의 설치 대상 경로에 배치한다.

#### Scenario: A declared tool requirement is absent

- **WHEN** 배포 목록의 스킬이 도구 의존성을 선언했고 잠금 파일에 해당 도구가 없다.
- **THEN** 설치 계획은 해당 스킬의 파일을 배포 대상으로 선택하지 않는다.

### Requirement: Validate declared standalone skill source roles

이 저장소의 모든 `[[skills]]` 항목은 `role`을 선언해야 한다(MUST).
설치기는 이 저장소의 역할별 등록 항목을 다음 기준으로 검사해야 한다(MUST).

| `role` | 로컬 `path` 접두사 | 추가 필드 |
|---|---|---|
| `custom` | `skills/custom/` | 없음 |
| `adapter` | `skills/adapters/` | 연동 대상 `adapts`. 외부 참조를 선언하면 `source`, `channel`, `files` |
| `upstream` | 없음 | `source`, `channel`, `files` |

`source`는 HTTPS GitHub 저장소다.
`channel`은 `default-branch` 또는 `latest-release`다.
`files`는 설치 대상 경로에서 외부 저장소의 상대 경로로 향하는 매핑이다.
어댑터의 외부 참조 파일은 로컬 `SKILL.md`와 다른 경로에 배치한다.

#### Scenario: A declared role conflicts with the source entry

- **WHEN** `role`을 선언한 항목이 해당 역할의 경로 또는 필드 규칙을 위반한다.
- **THEN** 설치기는 해당 항목을 포함한 배포 목록을 거부한다.

#### Scenario: A legacy entry has no role metadata

- **WHEN** 기존 규칙에 맞는 항목이 `role`과 `adapts`를 모두 생략한다.
- **THEN** 설치기는 기존 경로와 필드 규칙에 따라 항목을 받아들인다.
- **AND** `requires`의 설치 조건과 `~/.agents/skills/<name>/` 배포 경로를 유지한다.

### Requirement: Resolve and cache external skill sources

일반 설치와 갱신은 외부 원본의 현재 커밋을 채널에 따라 선택해야 한다(MUST).
설치기는 선택한 커밋과 검증한 파일 내용을 로컬 캐시에 원자적으로 기록해야 한다(MUST).

#### Scenario: Fetch an external skill during install or update

- **WHEN** 일반 `task install` 또는 `task update`를 실행하고 외부 원본 조회와 파일 검증에 성공한다.
- **THEN** 설치기는 선택한 커밋과 배포할 파일 내용을 상태 루트의 `external-skills.json`에 기록한다.
- **AND** 체크아웃에서 상태 루트를 지정하지 않으면 `.local/external-skills.json`을 사용한다.

#### Scenario: Preserve the cache after an upstream failure

- **WHEN** 외부 원본의 커밋 조회, 매핑된 파일의 다운로드 또는 검증에 실패한다.
- **THEN** 명령은 오류를 반환한다.
- **AND** 이전 캐시의 파일 내용과 선택한 커밋을 그대로 보존한다.

### Requirement: Use the installed external skill cache offline

`task plan`, `task check`, `task apply`와 잠금 모드는 외부 스킬을 로컬 캐시에서만 읽어야 한다(MUST).

#### Scenario: Use a compatible cache with the network unavailable

- **WHEN** 현재 등록과 호환되는 캐시가 있고 `task plan`, `task check` 또는 `task apply`를 실행한다.
- **THEN** 각 명령은 네트워크 조회 없이 캐시의 외부 파일을 사용한다.

#### Scenario: Defer skills when the cache file is unavailable

- **WHEN** `task plan` 또는 `task apply`를 실행하는데 외부 스킬 캐시 파일이 없거나 유효하지 않다.
- **THEN** 명령은 `DEFERRED` 줄에 캐시를 사용할 수 없는 이유를 표시한다.
- **AND** 해당 캐시가 필요한 스킬만 배포 대상에서 제외한다.
- **AND** 나머지 사전 검사를 통과하면 공통 파일과 로컬 스킬을 계획하거나 적용한다.

#### Scenario: Defer only the external skill with an invalid entry

- **WHEN** 한 외부 스킬의 캐시 항목이 없거나 검증에 실패하고 다른 외부 스킬의 캐시 항목은 유효하다.
- **THEN** `task plan`과 `task apply`는 문제 항목과 사유를 `DEFERRED`로 표시한다.
- **AND** 유효한 외부 스킬은 배포 대상에 남긴다.
- **AND** 적용은 보류한 스킬의 기존 설치 파일을 보존한다.

#### Scenario: Full check reports deferred external skills

- **WHEN** 다른 파일과 의존성은 모두 준비됐지만 외부 스킬이 하나 이상 보류됐다.
- **THEN** `task check`는 `DEFERRED` 줄에 사유를 표시한다.
- **AND** 보류 항목이 있으면 0이 아닌 종료 코드를 반환한다.

#### Scenario: Reproduce an external skill in locked mode

- **WHEN** `-Locked`를 지정하고 현재 외부 스킬 등록과 호환되는 캐시가 있다.
- **THEN** 설치기는 최신 커밋을 조회하지 않고 캐시에 기록한 커밋의 파일을 사용한다.

#### Scenario: Locked mode lacks a compatible cache

- **WHEN** `-Locked`를 지정했으나 필요한 외부 스킬의 캐시가 없거나 검증에 실패한다.
- **THEN** 명령은 캐시를 요구하는 오류를 반환한다.
- **AND** 외부 스킬의 최신 커밋을 조회하지 않는다.
