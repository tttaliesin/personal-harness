# Roylabs 기준 구성

기준은 2026년 11월 12일 `roylabs-desktop`에서 읽은 사용자 프로필이다.
기본 Codex 홈은 `~/.codex`이며, `CODEX_HOME`이나 실행 옵션으로 다른 홈을 지정할 수 있다.
사용자 정책의 기준은 유지하고, 관리 대상 외부 도구는 설치·업데이트 명령 실행 시 공식 최신 안정판으로 갱신한다.

## 공통 사용자 지침

[common/AGENTS.md](../common/AGENTS.md)는 Roylabs의 전역 지침을 보관한다.
사용자 절대경로 한 곳은 `${CODEX_HOME}`으로 바꿨다.
2026년 11월 16일 pstack과 EGM을 제거하면서 두 플러그인의 자동 호출 지침도 제거했다.
같은 날 CodeGraph와 Sites·브라우저의 선택 조건을 작업 목적에 맞게 완화했다.

- 실질적인 완료 시간을 줄이는 병렬 작업과 검증 가능한 근거를 사용한다.
- 관찰과 가설을 구분하고 인과·성능 주장에 재현 시험과 반증 조건을 둔다.
- 공식 agent-desktop CLI를 기본 데스크톱 조작 도구로 사용한다.
- 인덱스가 있는 저장소에서는 호출 관계·구조 탐색에 CodeGraph를 선택하고, 알려진 파일 읽기와 텍스트 검색은 바로 수행한다.
- 기존 OpenSpec 변경과 지속적인 명세가 필요한 기능·구조 변경에는 `openspec-workflow`를 선택하고, 구현 요청은 설계 이후에도 이어서 수행한다.
- 버전별 라이브러리 API 확인이 필요하면 실제 프로젝트 의존성 버전을 먼저 확인하고 Context7을 명시적 호출 없이 선택한다.
- 알려진 파일 읽기와 작은 기계적 수정에는 Context7을 선행 필수로 두지 않는다.
- Context7이 미지원·로그인·한도·결과 부족으로 충분한 근거를 주지 못하면 공식 문서와 소스 검사로 계속한다.
- .NET·ASP.NET Core·C#·Windows·PowerShell의 공식 자료가 필요하면 대상 버전을 확인하고 Microsoft Learn MCP를 명시적 호출 없이 선택한다.
- 현대 .NET과 .NET Framework를 구분하고 Context7과의 고정 호출 순서나 중복 조회를 요구하지 않는다.
- 스킬 이름을 명시하지 않아도 모델이 작업 목적에 맞는 도구를 선택한다.
- 웹사이트 제작과 시각 디자인·리디자인·완성도 개선에 적합하면 `design-taste-frontend`를 선택한다.
- 기존 저장소의 웹 개발 경로와 사용자가 지정한 배포 대상을 유지하고, 요청한 호스팅·게시 또는 기존 Site 유지보수에 Sites가 적합할 때 선택한다.
- 저장소의 E2E 테스트와 공개 자료 조회를 바로 수행하고, 실제 브라우저 조작이 필요할 때 대상·세션에 맞는 도구를 선택한다.
- 글·문단·문장의 목적을 하나로 유지하고 문장별 줄바꿈과 Mermaid를 사용한다.

적용 시 확인된 CLI의 절대경로가 있으면 생성되는 지침 끝에 해당 PC의 실행 위치를 덧붙인다.
이 경로는 공통 원본에 저장하지 않는다.
선택 조건은 공통 사용자 지침에서 관리한다.
앱·브라우저가 소유한 스킬과 플러그인 캐시를 수정하지 않으므로 해당 도구가 갱신돼도 공통 선택 기준은 유지된다.
기존 hook과 hook 신뢰 기록은 이 선택 조건 변경의 대상이 아니다.

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
| MCP | 공통 CodeGraph 실행 인자와 각 PC의 실행 파일 위치, registry의 Microsoft Learn 원격 HTTP 연결 |
| 플러그인 | 공통 OpenAI 11개 |
| 스킬 선택 | `computer-use` 비활성, `agent-desktop` 계열 활성 |

이 sandbox 값은 Roylabs 사용자가 설정한 기준이다.
현재 채팅에 적용되는 관리형 권한이나 조직 정책을 해제하지 않는다.
모델 공급자와 모델 카탈로그는 해당 PC에서 유지하므로 `gpt-6.1-sol / max` 사용 가능 여부도 해당 공급자에서 확인한다.

## 스킬과 외부 도구

| 구성 | 관리 방식 |
|---|---|
| `create-readme` | 사용자 원본을 `~/.agents/skills/create-readme`에 복사 |
| `openspec-workflow` | 저장소에서 작성한 연동 스킬을 `~/.agents/skills/openspec-workflow`에 복사 |
| `korean-typography` | 한글 웹·앱 UI 지침과 참조 문서를 `~/.agents/skills/korean-typography`에 복사 |
| `taste-windows-runtime` | 원본 Taste 브라우저 검사에만 적용하는 Windows 실행기를 `~/.agents/skills/taste-windows-runtime`에 복사 |
| `feature-sliced-design` | 공식 FSD 원본과 참조·평가 디렉터리 전체를 `~/.agents/skills/feature-sliced-design`에 복사하며 이미 FSD를 쓰는 저장소에서만 자율 선택 |
| `agent-desktop` | 설치한 최신 안정 릴리스의 공식 스킬과 참조 문서를 Codex 홈의 `skills`에 복사 |
| `agent-desktop-windows` | 같은 릴리스의 Windows 스킬과 참조 문서를 복사 |
| agent-desktop CLI | GitHub 최신 안정 릴리스의 Windows x64 배포물과 실행 파일 SHA256 확인 |
| CodeGraph CLI | npm `@colbymchenry/codegraph`의 `latest` 배포와 integrity 확인 |
| OpenSpec CLI | npm `@fission-ai/openspec`의 `latest` 배포와 integrity 확인 |
| Context7 | 공식 `context7@context7-marketplace` 플러그인을 기존 설치기 지원으로 관리하며 `git-ref: master`를 정확한 commit과 콘텐츠 digest로 lock에 고정 |
| Microsoft Learn MCP | `registry.toml`에서 공식 원격 HTTP `https://learn.microsoft.com/api/mcp`를 관리하며 별도 의존성 패키지를 설치하지 않음 |
| Taste Skill | 원본 `taste-skill@taste-skill` 플러그인의 `design-taste-frontend`를 두 PC의 설치 대상으로 지정 |

Context7의 원격 저장소는 [upstash/context7.git](https://github.com/upstash/context7.git)이다.
현재 확인한 플러그인 manifest 버전은 `1.0.2`다.
플러그인은 hosted endpoint `https://mcp.context7.com/mcp`를 사용하므로 로컬 MCP 서버 프로세스를 추가하지 않는다.
설치 후에는 [공식 안내](https://context7.com/docs/clients/codex)에 따라 새 스레드에서 스킬과 도구를 로드한다.
무인증 protocol 조회의 단일 성공은 계속되는 무인증 접근이나 두 PC 설치 완료의 근거로 사용하지 않는다.
계정 정보와 토큰은 Git에서 제외한다.
원본 플러그인 캐시와 프로젝트의 repo-governance는 유지한다.

[Microsoft Learn MCP 공식 안내](https://learn.microsoft.com/en-us/training/support/mcp)의 공개 원격 서버를 사용한다.
작은 기계적 수정에는 문서 조회를 필수로 두지 않는다.
문서는 실제 서버 상태를 대신하지 않으며 연결 실패 시 공식 문서·소스·로컬 검사로 계속한다.
조회에는 필요한 기술 질문만 전달하고 비공개 코드·인증 값·사용자 대화 전체는 전송하지 않는다.

Taste Skill을 사용할 때도 기존 프레임워크, SSR·API·인증·데이터 흐름, 컴포넌트·디자인 토큰과 배포 경로를 유지한다.
기존 저장소의 개발 규칙도 유지한다.
사용자와 프로젝트의 제약은 스킬의 호환되지 않는 기본값보다 우선한다.
원본의 Next.js 정적 내보내기 규칙 때문에 기존 프로젝트를 정적 내보내기로 전환하지 않는다.

원본 플러그인 파일과 캐시는 수정하지 않는다.

한국어 UI를 생성하거나 시각적으로 검토할 때는 `korean-typography`를 함께 선택한다.
기존 브랜드 서체를 우선하고 한글 글리프, 영문·숫자 혼합, 줄바꿈과 실제 폰트 로딩을 확인한다.
수치와 후보 서체는 작업에 맞게 조정하는 출발점이다.
대화가 한국어라는 이유만으로 결과물의 언어를 바꾸지 않는다.

초기 스킬 파일 11개의 SHA256은 [Roylabs 원본 기록](../sources/roylabs-2026-11-12.json)에 있다.
공식 FSD 스킬의 고정 commit과 전체 파일 해시는 [FSD 출처 기록](../sources/feature-sliced-skill.json)에 있다.
FSD 스킬은 배포 소스에 포함된 스킬로 등록하며 Git 플러그인·MCP용 `registry.toml`에 가짜 플러그인 항목을 추가하지 않는다.
Steiger와 ArchUnitNET의 도입은 저장소별로 결정하며 하네스 전역 의존성이나 자동 hook으로 등록하지 않는다.
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
OpenSpec가 없는 이전 lock을 `-Locked`로 재현하면 기존 의존성만 설치한다.
OpenSpec를 추가하려면 일반 `update`로 새 lock을 만든다.

내장 스킬, OpenAI 앱 런타임, 계정별 연결 앱 목록, 채팅 이력은 이 저장소의 배포 대상에 포함하지 않는다.
