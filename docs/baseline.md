# Roylabs 기준 구성

기준은 2026년 11월 12일 `roylabs-desktop`에서 읽은 사용자 프로필이다.
기본 Codex 홈은 `~/.codex`이며, `CODEX_HOME`이나 실행 옵션으로 다른 홈을 지정할 수 있다.
사용자 정책의 기준은 유지하고, 관리 대상 외부 도구는 설치·업데이트 명령 실행 시 공식 최신 안정판으로 갱신한다.

## 공통 사용자 지침

[common/AGENTS.md](../common/AGENTS.md)는 Roylabs의 전역 지침을 보관한다.
내용은 유지하고 사용자 절대경로 한 곳만 `${CODEX_HOME}`으로 바꿨다.

- 실질적인 완료 시간을 줄이는 병렬 작업과 검증 가능한 근거를 사용한다.
- 관찰과 가설을 구분하고 인과·성능 주장에 재현 시험과 반증 조건을 둔다.
- 공식 agent-desktop CLI를 기본 데스크톱 조작 도구로 사용한다.
- 인덱스가 있는 저장소에서 CodeGraph를 먼저 사용한다.
- pstack이 전체 작업을 조율하고 필요한 문서 단계는 EGM이 담당한다.
- 같은 입력과 기준으로 완료한 검토를 재사용한다.
- 글·문단·문장의 목적을 하나로 유지하고 문장별 줄바꿈과 Mermaid를 사용한다.

적용 시 확인된 CLI의 절대경로가 있으면 생성되는 지침 끝에 해당 PC의 실행 위치를 덧붙인다.
이 경로는 공통 원본에 저장하지 않는다.

## 공통 설정

| 항목 | 기준 값 |
|---|---|
| 모델 / 추론 | `gpt-6.1-sol` / `max` |
| 응답 상세도 / 추론 요약 | `high` / `detailed` |
| 서비스 수준 | `default` |
| 승인 정책 | `on-request` |
| 사용자 설정의 sandbox | `danger-full-access` |
| Windows sandbox | PC 프로필의 `elevated` |
| Multi-agent | `true` |
| 자동 보관 | 1일 |
| 로캘 | `ko-KR` |
| MCP | 공통 CodeGraph 실행 인자와 각 PC의 실행 파일 위치 |
| 플러그인 | 공통 OpenAI 11개와 pstack, EGM |
| 스킬 선택 | `computer-use` 비활성, `agent-desktop` 계열 활성 |

이 sandbox 값은 Roylabs 사용자가 설정한 기준이다.
현재 채팅에 적용되는 관리형 권한이나 조직 정책을 해제하지 않는다.
모델 공급자와 모델 카탈로그는 해당 PC에서 유지하므로 `gpt-6.1-sol / max` 사용 가능 여부도 해당 공급자에서 확인한다.

## 스킬과 외부 도구

| 구성 | 관리 방식 |
|---|---|
| `create-readme` | 사용자 원본을 `~/.agents/skills/create-readme`에 복사 |
| `agent-desktop` | 설치한 최신 안정 릴리스의 공식 스킬과 참조 문서를 Codex 홈의 `skills`에 복사 |
| `agent-desktop-windows` | 같은 릴리스의 Windows 스킬과 참조 문서를 복사 |
| agent-desktop CLI | GitHub 최신 안정 릴리스의 Windows x64 배포물과 실행 파일 SHA256 확인 |
| CodeGraph CLI | npm `@colbymchenry/codegraph`의 `latest` 배포와 integrity 확인 |
| pstack | 공식 최신 안정 릴리스의 정확한 commit으로 Codex 플러그인 설치 |
| EGM | 공식 최신 안정 릴리스의 정확한 commit으로 Codex 플러그인 설치 |

초기 스킬 파일 11개의 SHA256은 [Roylabs 원본 기록](../sources/roylabs-2026-11-12.json)에 있다.
현재 설치 결과와 버전 정보는 [dependencies.lock.json](../sources/dependencies.lock.json)에 기록한다.
스킬에 포함된 문서를 일부만 복사하지 않고 해당 디렉터리 전체를 관리한다.

Ego와 `ego-browser` 스킬은 각 PC의 브라우저가 소유한다.
이 저장소는 앱이나 스킬의 설치·업데이트·버전 검사·링크 생성에 관여하지 않는다.
Ego가 없거나 스킬이 다른 경로에 연결돼 있어도 Harness 적용을 막지 않는다.

## PC에서 유지하는 설정

| 설정 | 이유 |
|---|---|
| `notify`, `mcp_servers.node_repl` 전체 | Codex 앱 버전, 실행 파일, 브라우저 서비스, 실행 중 생성되는 파이프에 의존 |
| OpenAI 번들 marketplace의 로컬 경로 | 앱과 런타임 설치 위치에 의존 |
| `model_catalog_json`, OpenCodex URL | 해당 PC의 로컬 공급자 구성 |
| `projects` | 해당 PC의 저장소 경로와 신뢰 등록 |
| `computer_use.windows.always_allowed_app_ids` | 해당 PC의 앱 권한 |
| `hooks.state` | 해당 PC에서 실제로 신뢰한 hook 기록 |
| 계정 연결과 인증 자료 | 계정 및 설치 환경에서 별도로 관리 |

전역 지침의 `AGENTS.override.md`가 있으면 적용을 중단한다.
관리 대상 스킬에 사용자가 수정하거나 추가한 잔여 파일이 있으면 먼저 조정하도록 알린다.
이전 적용 기록과 내용이 일치하는 잔여 파일은 백업 후 정리한다.
추가로 설치한 다른 스킬과 공통 파일에서 지정하지 않은 설정은 병합 과정에서 유지한다.

## 기준을 갱신할 때

사용자 정책은 `common`에서 수정하고 두 호스트의 `plan`으로 영향을 확인한다.
설치 경로 변경은 `.local/<hostname>.toml`에 기록한다.
외부 스킬을 갱신할 때는 참조 문서 전체와 라이선스를 함께 확인하고 원본 해시와 버전 명세를 갱신한다.
설치·업데이트 명령은 공식 최신 버전 조회와 버전·배포 해시 검증을 수행한다.
최신 조회가 실패하면 기존 lock을 최신 결과로 가장하지 않고 실패를 알린다.
`-Locked`는 기록한 설치 결과를 재현할 때 사용한다.

내장 스킬, OpenAI 앱 런타임, 계정별 연결 앱 목록, 채팅 이력은 이 저장소의 배포 대상에 포함하지 않는다.
