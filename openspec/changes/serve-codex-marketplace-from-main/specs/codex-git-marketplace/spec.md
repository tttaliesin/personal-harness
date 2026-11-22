# Spec Delta

## Purpose

각 PC의 Codex가 Personal Harness의 공개 기본 브랜치에서 자체 플러그인을 찾아 설치할 수 있게 한다.
첫 게시에서 기존 배포 버전을 이어받는다.

## ADDED Requirements

### Requirement: Native Git marketplace on the default branch

공개 Personal Harness 저장소의 기본 브랜치 `main`은 `.agents/plugins/marketplace.json`에 `personal-harness` 마켓플레이스를 제공해야 한다(MUST).
카탈로그는 세 자체 플러그인을 저장소 루트 기준 배포 경로에 연결해야 한다.

#### Scenario: 새 Codex 프로필에서 등록

- **WHEN** PC별 번들 경로가 없는 Codex 프로필에서 `codex plugin marketplace add tttaliesin/personal-harness`를 실행한다.
- **THEN** Codex는 저장소의 Git 기본 브랜치 `main`에서 `personal-harness`를 등록한다.
- **AND** 설치 대상은 `repo-governance@personal-harness`, `windows-agent-devkit@personal-harness`, `worker-orchestrator@personal-harness`다.

#### Scenario: 공개 카탈로그의 배포 경로 조회

- **WHEN** Codex가 공개 카탈로그의 세 항목을 읽는다.
- **THEN** `repo-governance`는 `./packages/repo-governance/plugin`에서 설치할 수 있다.
- **AND** `windows-agent-devkit`은 `./packages/windows-agent-devkit/release`에서 설치할 수 있다.
- **AND** `worker-orchestrator`는 `./packages/worker-orchestrator/release`에서 설치할 수 있다.

### Requirement: Initial deployment provenance

첫 카탈로그의 세 항목은 각각 이전 배포 버전을 이어받아야 한다(MUST).
Windows Agent Devkit은 공개 문서에서 개인 작업 경로 한 곳을 가린 뒤 이전 배포 파일을 사용해야 한다.
Worker Orchestrator의 첫 공개 배포본은 승인한 기존 배포본과 일치해야 한다.

#### Scenario: 첫 배포본 설치

- **WHEN** 새 Codex 프로필에서 카탈로그의 첫 배포본을 설치한다.
- **THEN** `repo-governance` `0.2.0`, `windows-agent-devkit` `0.3.5`, `worker-orchestrator` `0.1.6`이 설치된다.

#### Scenario: Windows Agent Devkit의 공개 문서 확인

- **WHEN** 공개 Windows Agent Devkit `0.3.5`를 이전 배포본과 대조한다.
- **THEN** `docs/roadmap.md`의 개인 WSL 작업 경로 한 곳만 가린 상태다.
- **AND** 파일 목록이 일치한다.
- **AND** 실행 파일을 포함한 나머지 모든 파일의 SHA-256이 일치한다.

#### Scenario: 승인한 Worker Orchestrator 배포본과 대조

- **WHEN** 공개 Worker Orchestrator `0.1.6`을 승인한 기존 배포본과 대조한다.
- **THEN** 파일 목록과 모든 파일의 SHA-256이 일치한다.

#### Scenario: repo-governance 배포 범위 검사

- **WHEN** `repo-governance`의 공개 배포 경로를 검사한다.
- **THEN** 배포 경로는 공개용으로 정리한 공용 `plugin/`을 가리킨다.
- **AND** 개인용 카탈로그와 제품별 설정은 각 환경에만 둔다.

### Requirement: Legacy host configuration compatibility

공통 설치기는 세 자체 플러그인의 이전 번들 경로 설정을 건너뛰어야 한다(MUST).
공통 설정과 단독 스킬, 등록한 외부 의존성은 기존 공통 설치 명령으로 관리한다.

#### Scenario: 이전 번들 경로가 남은 PC에서 갱신

- **WHEN** 로컬 TOML에 세 자체 플러그인의 이전 `[plugin_bundles]` 경로가 남아 있는 PC에서 공통 갱신을 실행한다.
- **THEN** 공통 설치기는 해당 경로를 검사하지 않고 자체 플러그인 외의 설치를 계속한다.
- **AND** 기존 로컬 플러그인 등록과 hook 신뢰를 보존한다.

### Requirement: Per-PC plugin selection and hook trust

플러그인 설정과 hook 신뢰는 각 PC의 Codex 프로필에서 관리해야 한다(MUST).

#### Scenario: 기존 로컬 설치에서 전환

- **WHEN** 이전 로컬 등록이 있는 Codex 프로필에 `personal-harness`의 세 플러그인을 설치한다.
- **THEN** 사용자는 그 PC에서 Git 마켓플레이스의 항목을 활성화하고 이전 로컬 항목을 끌 수 있다.
- **AND** Codex가 새 hook 검토를 요청하면 사용자는 해당 PC에서 검토한다.

### Requirement: Marketplace upgrade for later releases

이후 배포본은 같은 공개 `main`의 `personal-harness` 마켓플레이스를 갱신해 받을 수 있어야 한다(MUST).

#### Scenario: 같은 마켓플레이스로 새 버전 설치

- **WHEN** 새 플러그인 버전을 공개 `main`에 게시한 뒤 `codex plugin marketplace upgrade personal-harness`를 실행한다.
- **THEN** Codex는 새 버전이 있는 카탈로그와 배포 파일을 가져온다.
