# Spec Delta

## Purpose

하네스와 자체 플러그인의 소스, 테스트, 배포 파일을 각 패키지에서 찾을 수 있게 한다.
저장소의 내부 배치를 바꿔도 기존 설치 명령과 PC별 상태를 재사용할 수 있게 한다.

## ADDED Requirements

### Requirement: Group source and deployment files by package

저장소는 하네스와 자체 플러그인의 소스, 테스트, 배포 파일을 각 `packages/<name>/`에 모아야 한다(MUST).
여러 패키지가 함께 쓰는 진입점과 문서는 저장소 루트에서 관리한다.

#### Scenario: Inspect the harness package

- **WHEN** 하네스 패키지의 파일을 확인한다.
- **THEN** `packages/harness/installer/`에 설치 구현, `personal-harness.mjs`와 `requirements.txt`가 있다.
- **AND** `packages/harness/resources/`에 `common/`, `skills/`, `dependencies/`와 `registry.toml`이 있다.
- **AND** 하네스 테스트와 픽스처는 `packages/harness/tests/`에 있다.

#### Scenario: Locate the public plugin releases

- **WHEN** 루트 카탈로그의 `source.path`를 확인한다.
- **THEN** `repo-governance`는 `./packages/repo-governance/plugin`을 가리킨다.
- **AND** `windows-agent-devkit`은 `./packages/windows-agent-devkit/release`를 가리킨다.
- **AND** `worker-orchestrator`는 `./packages/worker-orchestrator/release`를 가리킨다.
- **AND** 각 플러그인의 소스와 테스트는 해당 배포 폴더가 속한 패키지에 있다.

#### Scenario: Locate repository-wide entry points

- **WHEN** 저장소 공통 진입점과 문서를 확인한다.
- **THEN** `package.json`, `Taskfile.yml`, `.agents/plugins/marketplace.json`, `docs/`와 `openspec/`의 루트 기준 경로가 유지된다.
- **AND** 여러 패키지를 함께 검사하는 테스트는 `tests/test_codex_marketplace.py`에 있다.

### Requirement: Preserve command and state compatibility

설치기는 기존 루트 `npx`와 Task 명령, PC별 상태 경로를 유지해야 한다(MUST).
플러그인은 기존 Codex 마켓플레이스와 명령으로 설치할 수 있어야 한다(MUST).

#### Scenario: Inspect the npm payload

- **WHEN** 루트에서 `npm pack --dry-run --json`으로 배포 목록을 확인한다.
- **THEN** `personal-harness` 진입점은 `packages/harness/installer/personal-harness.mjs`다.
- **AND** 배포에는 설치기와 하네스 리소스를 포함한다.
- **AND** 자체 플러그인 패키지, 테스트, `docs/history/`와 PC별 상태는 제외한다.

#### Scenario: Run the existing Task test command

- **WHEN** 저장소 루트에서 `task test`를 실행한다.
- **THEN** 하네스 테스트와 루트의 마켓플레이스 테스트를 모두 실행한다.

#### Scenario: Reuse an existing state root

- **WHEN** 기존 설치를 이어서 갱신하거나 같은 체크아웃에서 계획·검사·적용을 실행한다.
- **THEN** 기존 상태 루트의 PC별 TOML, 도구, `sources/dependencies.lock.json`과 `external-skills.json`을 계속 사용한다.
- **AND** 저장소 배치 변경만으로 Codex 홈이나 `~/.agents/skills/<name>/`의 위치를 바꾸지 않는다.

### Requirement: Preserve verified public release payloads

패키지 경로를 이관할 때 카탈로그는 기존 공개 버전을 가리켜야 한다(MUST).
이관 직후 Windows Agent Devkit과 Worker Orchestrator의 `release/`에는 기존 공개 배포본의 파일을 바이트 그대로 보존해야 한다(MUST).

#### Scenario: Compare the catalog releases before and after relocation

- **WHEN** 새 배포 경로의 매니페스트를 이동 전 공개 배포본과 대조한다.
- **THEN** 버전은 `repo-governance` `0.2.0`, `windows-agent-devkit` `0.3.5`, `worker-orchestrator` `0.1.6`이다.
- **AND** 두 `release/`의 파일 목록과 파일별 SHA-256이 이전 공개 배포본과 일치한다.
- **AND** Git은 두 `release/`에 줄 끝 변환을 적용하지 않는다.
