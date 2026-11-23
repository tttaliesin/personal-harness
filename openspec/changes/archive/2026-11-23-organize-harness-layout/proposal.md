# Proposal

## Why

스킬의 배포 여부를 알려면 디렉터리, 설치기 코드, 배포 목록을 대조해야 한다.
두 PC가 같은 Windows 기본값을 호스트별 파일에서 각각 관리한다.
외부 스킬의 사본을 Git에 두면 갱신할 때 원본과 사본을 함께 관리해야 한다.
자체 플러그인의 소스, 테스트와 배포본은 패키지별로 찾을 수 있어야 한다.

PC에서 선택한 모델 설정과 실제 설치 결과는 PC별로 관리해야 한다.
외부 스킬 캐시가 없어도 공통 지침과 설정을 적용할 수 있어야 한다.

## What Changes

- 자체 스킬은 `packages/harness/resources/skills/custom/`에 두고 연동·호환 어댑터는 `packages/harness/resources/skills/adapters/`에 둔다.
- `packages/harness/resources/registry.toml`에 단독 스킬의 역할과 원본 경로, 도구 의존성을 선언한다.
- 자체 플러그인의 소스는 각 `packages/<name>/`에 둔다.
- 어댑터는 같은 등록 항목에 연동 대상을 기록한다.
- 외부 스킬과 STE-KO 참조 자료는 원본 저장소 주소, 갱신 기준, 배포할 파일 경로로 선언한다.
- 일반 설치와 갱신은 외부 원본의 커밋을 선택해 검증한 파일과 함께 로컬 캐시에 기록한다.
- 계획과 적용은 캐시를 사용할 수 없는 외부 스킬을 사유와 함께 표시한다.
- 적용은 사전 검사를 통과한 나머지 변경을 반영한다.
- 전체 검사는 보류된 외부 스킬이 있으면 실패한다.
- 일반 설치와 잠금 설치는 설치 대상 외부 스킬의 검증을 요구한다.
- 설치 구현, `personal-harness.mjs`와 `requirements.txt`를 `packages/harness/installer/`에 둔다.
- 공통 지침과 설정, 스킬, 의존성 초기값과 등록 목록을 `packages/harness/resources/`에 둔다.
- 하네스 테스트와 픽스처를 `packages/harness/tests/`에 둔다.
- 여러 패키지를 함께 검사하는 `tests/test_codex_marketplace.py`는 루트에 둔다.
- 카탈로그는 `packages/repo-governance/plugin/`과 두 플러그인의 `release/`를 가리킨다.
- 두 `release/`의 파일은 기존 공개 배포본과 바이트가 같아야 한다.
- 공개 배포 버전은 `repo-governance` `0.2.0`, Windows Agent Devkit `0.3.5`, Worker Orchestrator `0.1.6`을 유지한다.
- 두 PC가 공유하는 Windows 설정은 `packages/harness/resources/common/config.toml`에 둔다.
- 모델, 추론 수준, 입력 제안은 기존 프로필 값이나 PC별 덮어쓰기를 사용한다.
- 설치 결과는 선택한 PC별 상태 루트의 의존성 잠금에 기록한다.
- 저장소에 추적하는 잠금은 읽기 전용 초기값으로 사용한다.
- `package.json`의 `supportedHosts`에 설치 대상을 적고 PC별 설정은 로컬 TOML에서 관리한다.
- 루트의 npm 설정, Taskfile, Codex 카탈로그, `docs/`와 `openspec/` 위치를 유지한다.
- 기존 `npx`, Task, Codex 명령과 각 PC의 상태 및 스킬 경로를 유지한다.

## Capabilities

### New Capabilities

- `registered-skills` — 등록한 로컬 스킬과 외부 스킬을 사용자 스킬 경로에 설치한다.
- `harness-local-state` — PC별 사용자 설정을 보존하고 설치한 의존성의 잠금을 로컬 상태에 기록한다.
- `harness-package-layout` — 패키지별 소스와 배포 경로를 정의하고 기존 명령으로 설치와 검증을 수행한다.

### Modified Capabilities

## Impact

스킬 원본 경로, 저장소 설치기와 npm 배포 파일, Codex 카탈로그, 배포 문서와 테스트가 바뀐다.
`consolidate-owned-plugins`는 자체 플러그인의 최초 이관과 출처를 기록한다.
`serve-codex-marketplace-from-main`은 공개 마켓플레이스의 설치 계약을 정의한다.
