# Design

## Context

PC별 설정은 기존 로컬 TOML에 둔다.
공식 Agent Desktop 릴리스는 설치기가 검증하고 Codex 홈에 배포한다.

## Decisions

- `skills/<용도>/<이름>/`에는 자체 스킬과 상대 경로로 읽는 자료를 함께 둔다.
  STE-KO 연결 스킬은 외부 참조 자료를 같은 디렉터리에서 제공한다.
- 외부 단독 스킬 원본과 출처 기록은 `dependencies/`에 둔다.
  원본 디렉터리의 내부 경로와 파일 내용은 보존한다.
- 설치기는 `registry.toml`의 `[[skills]]`에서 단독 스킬 배포 대상을 읽는다.
  각 경로는 저장소 기준 상대 경로다.
  OpenSpec 작업 스킬은 잠금 파일에 `openspec`이 있을 때 적용한다.
- 공식 Agent Desktop 스킬은 `skills/agent-desktop/`과 `skills/agent-desktop-windows/`에 둔다.
  릴리스 검증에는 `sources/agent-desktop-LICENSE`를 사용한다.
- `bin/`은 npm 진입점을 제공하고 `installer/`는 설치와 적용을 담당한다.
  `task test`는 루트 `Taskfile.yml`에서 Python `unittest`를 직접 실행한다.
- `common/config.toml`의 `windows.sandbox`는 두 PC에 공통 기본값 `elevated`를 제공한다.
  설치기는 `package.json`의 `supportedHosts`에서 설치 대상 이름을 확인한다.
  PC마다 필요한 설정은 `docs/local.example.toml`을 참고해 로컬 TOML에서 덮어쓴다.

## Migration Plan

새 설치 패키지에는 새 원본 경로와 초기 잠금 파일 `dependencies/dependencies.lock.json`을 포함한다.
원격 설치는 기존 상태 루트의 잠금 파일과 사용자 프로필의 스킬 경로를 다시 사용한다.
이전 레이아웃의 임시 설치 소스는 기존 소유권 및 해시 검증을 통과할 때 정리할 수 있다.
이전 설치 패키지에 PC별 프로필이 포함된 경우에는 정리 시 해당 파일도 함께 검증한다.
