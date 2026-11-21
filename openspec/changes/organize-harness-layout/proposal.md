# Proposal

## Why

스킬의 배포 여부를 알려면 디렉터리, 설치기 코드, 배포 목록을 대조해야 한다.
두 PC가 같은 Windows 기본값을 호스트별 파일에서 각각 관리한다.
외부 스킬의 사본을 Git에 두면 갱신할 때 원본과 사본을 함께 관리해야 한다.

## What Changes

- 자체 스킬은 `skills/custom/`에 두고 연동·호환 어댑터는 `skills/adapters/`에 둔다.
- `registry.toml`에 단독 스킬의 역할과 원본 경로, 도구 의존성을 선언한다.
- 어댑터는 같은 등록 항목에 연동 대상을 기록한다.
- 외부 스킬과 STE-KO 참조 자료는 원본 저장소 주소, 갱신 기준, 배포할 파일 경로로 선언한다.
- 일반 설치와 갱신은 외부 원본의 커밋을 선택해 검증한 파일과 함께 로컬 캐시에 기록한다.
- 계획·검사·적용은 외부 스킬을 로컬 캐시에서 오프라인으로 읽는다.
- 잠금 모드는 현재 등록과 호환되는 기존 캐시를 사용한다.
- 설치 구현을 `installer/`에 둔다.
- 두 PC가 공유하는 Windows 설정은 `common/config.toml`에 둔다.
- `package.json`의 `supportedHosts`에 설치 대상을 적고 PC별 설정은 로컬 TOML에서 관리한다.
- 기존 명령과 각 PC에서 스킬을 찾는 경로를 유지한다.

## Capabilities

### New Capabilities

- `registered-skills` — 등록한 로컬 스킬과 외부 스킬을 사용자 스킬 경로에 설치한다.

### Modified Capabilities

## Impact

스킬 원본 경로, 저장소 설치기와 npm 배포 파일, 배포 문서와 테스트가 바뀐다.
