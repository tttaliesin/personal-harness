# Design

## Context

PC별 설정은 기존 로컬 TOML에 둔다.
공식 Agent Desktop 릴리스는 설치기가 검증하고 Codex 홈에 배포한다.

## Decisions

### 스킬 원본 선언

- 자체 스킬은 `skills/custom/<name>/`에 둔다.
- 연동·호환 어댑터는 `skills/adapters/<name>/`에 둔다.
  `ste-ko`의 `SKILL.md`는 로컬에 둔다.
  설치기는 등록한 외부 참조 파일을 어댑터의 설치 폴더에 추가한다.
- 설치기는 `registry.toml`의 `[[skills]]`에서 배포 대상을 읽는다.
  `path`는 자체 스킬과 어댑터의 저장소 기준 상대 경로다.
  어댑터의 `adapts`는 연동 대상을 가리킨다.
  `source`는 외부 스킬 또는 참조 파일을 제공하는 HTTPS GitHub 저장소다.
  `channel`에는 기본 브랜치의 `default-branch` 또는 최신 안정 릴리스의 `latest-release`를 쓴다.
  `files`는 스킬의 설치 대상 경로를 외부 저장소의 상대 경로에 연결한다.
  대상 경로가 `"."`이면 지정한 외부 디렉터리의 내용 전체를 스킬 폴더에 배치한다.

| 스킬 | 역할 | 원본과 채널 |
|---|---|---|
| `feature-sliced-design` | `upstream` | `feature-sliced/skills`, `default-branch` |
| `humanize-korean` | `upstream` | `epoko77-ai/im-not-ai`, `latest-release` |
| `ste-ko` | `adapter` | 참조 파일은 `beamonic/ste-ko`, `default-branch` |

`humanize-korean`의 파일 매핑은 Codex 진입점이 읽는 경로에 원본 참조 파일과 실행 스크립트를 배치한다.

### 외부 스킬 캐시

일반 `task install`과 `task update`는 각 `channel`에서 현재 커밋을 선택한다.
설치기는 그 커밋에서 선언한 파일을 가져와 검증한다.
모든 외부 파일을 검증한 뒤 선택한 커밋과 파일 내용을 담은 캐시를 원자적으로 교체한다.
원본 조회, 다운로드 또는 검증에 실패하면 기존 캐시를 보존한다.

체크아웃의 기본 캐시는 `.local/external-skills.json`이다.
상태 루트를 지정하면 `<state-root>/external-skills.json`을 사용한다.

`task plan`, `task check`, `task apply`는 외부 파일을 캐시에서 오프라인으로 읽는다.

설치기는 외부 스킬 캐시의 각 항목을 현재 등록과 대조한다.
항목이 없거나 검증에 실패하면 해당 스킬을 보류하고 `DEFERRED`에 사유를 표시한다.
캐시 전체를 읽을 수 없으면 그 캐시가 필요한 모든 스킬을 보류한다.
보류한 스킬의 기존 설치 파일은 유지한다.
다른 사전 검사에 문제가 없으면 계획과 적용은 배포 가능한 파일을 계속 처리한다.
`task check`는 보류가 남아 있으면 실패를 반환한다.

`-Locked`는 필요한 모든 외부 스킬에 현재 등록과 호환되는 캐시 항목을 요구한다.
`task update:plan`은 등록한 원본을 조회하고 계획만 표시한다.

### 설치 경로와 호스트 구성

- 설치기는 `role`을 선언한 항목의 필드를 역할에 맞게 검사한다.
  `role`과 `adapts`가 모두 없는 로컬 항목에는 기존 검사를 적용한다.
  등록한 단독 스킬은 `name`에 따라 `~/.agents/skills/<name>/`에 배치한다.
  OpenSpec 작업 스킬은 잠금 파일에 `openspec`이 있을 때 적용한다.
- 공식 Agent Desktop 스킬은 `skills/agent-desktop/`과 `skills/agent-desktop-windows/`에 둔다.
  릴리스 검증에는 `sources/agent-desktop-LICENSE`를 사용한다.
- `bin/`은 npm 진입점을 제공하고 `installer/`는 설치와 적용을 담당한다.
  `task test`는 루트 `Taskfile.yml`에서 Python `unittest`를 직접 실행한다.
- `common/config.toml`의 `windows.sandbox`는 두 PC에 공통 기본값 `elevated`를 제공한다.
  설치기는 `package.json`의 `supportedHosts`에서 설치 대상 이름을 확인한다.
  PC마다 필요한 설정은 `docs/local.example.toml`을 참고해 로컬 TOML에서 덮어쓴다.

### PC별 설정과 잠금

설정 병합은 기존 Codex 프로필에서 시작한다.
`common/config.toml`에서 `model`, `model_reasoning_effort`, `desktop.composer-predictions-enabled`를 제외한다.
PC별 TOML의 `[config]`나 `[config.desktop]`에 해당 키를 명시하면 마지막 병합 단계에서 적용한다.

의존성 설치 결과는 `<state-root>/sources/dependencies.lock.json`에 기록한다.
체크아웃에서는 Git에서 제외된 `.local`이 기본 상태 루트다.
설치는 활성 잠금이 없을 때만 저장소의 `dependencies/dependencies.lock.json`을 초기값으로 읽는다.
기존 원격 설치가 인접 체크아웃에서 초기값을 찾는 경로도 유지한다.

계획·검사·적용은 활성 잠금을 우선 읽는다.
상태 루트를 명시하지 않은 체크아웃에 활성 잠금이 없으면 저장소의 초기값으로 의존성을 확인한다.
상태 루트를 명시한 실행은 해당 위치에 활성 잠금이 있어야 계획·검사·적용을 완료한다.

## Migration Plan

새 설치 패키지에는 자체 스킬과 로컬 어댑터 원본을 포함한다.
외부 스킬의 사본과 이전 출처 기록은 제거하고 파일을 받을 등록 정보를 포함한다.
초기 잠금 파일로 `dependencies/dependencies.lock.json`을 제공한다.
원격 설치는 기존 상태 루트의 잠금 파일과 사용자 프로필의 스킬 경로를 다시 사용한다.
이전 설치에 외부 스킬 캐시가 없다면 일반 설치나 갱신으로 캐시를 준비할 수 있다.
이전 레이아웃의 임시 설치 소스는 기존 소유권 및 해시 검증을 통과할 때 정리할 수 있다.
이전 설치 패키지에 PC별 프로필이 포함된 경우에는 정리 시 해당 파일도 함께 검증한다.
