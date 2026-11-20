# Proposal

## Why

스킬의 배포 여부를 알려면 디렉터리, 설치기 코드, 배포 목록을 대조해야 한다.
두 PC가 같은 Windows 기본값을 호스트별 파일에서 각각 관리한다.

## What Changes

- 배포할 자체 스킬을 용도별로 묶고 외부 스킬의 스냅샷과 출처 기록은 `dependencies/`에 둔다.
- `registry.toml`에 단독 스킬의 원본 경로와 도구 의존성을 선언한다.
- 설치 구현을 `installer/`에 둔다.
- 두 PC가 공유하는 Windows 설정은 `common/config.toml`에 둔다.
- `package.json`의 `supportedHosts`에 설치 대상을 적고 PC별 설정은 로컬 TOML에서 관리한다.
- 기존 명령과 각 PC에서 스킬을 찾는 경로를 유지한다.

## Capabilities

### New Capabilities

- `registered-skills` — 배포 목록에 등록한 스킬 디렉터리를 사용자 스킬로 설치한다.

### Modified Capabilities

## Impact

스킬 원본 경로, 저장소 설치기와 npm 배포 파일, 배포 문서와 테스트가 바뀐다.
