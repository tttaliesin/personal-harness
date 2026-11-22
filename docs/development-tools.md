# 외부 리소스와 어댑터

[external-resources.toml](../external-resources.toml)은 외부 스킬, 참조 문서, 플러그인, MCP 서버와 CLI의 출처를 기록한다.
외부 리소스는 각 원본의 설치 절차를 따른다.

## 원본과 갱신 기준

| 항목 | 매니페스트에서 확인할 값 |
|---|---|
| 외부 스킬과 참조 문서 | 원본 저장소, `channel`, 원본의 `path` 또는 `paths` |
| 외부 Codex 플러그인 | 원본 저장소, 마켓플레이스 이름, 플러그인 매니페스트의 경로 |
| MCP 서버 | 공식 원격 URL 또는 패키지와 실행 명령 |
| CLI | 공식 원본과 패키지 이름 |

`default-branch`는 원본의 기본 브랜치를 가리킨다.
`latest-release`는 원본의 최신 릴리스를 가리킨다.
`latest`는 해당 패키지 피드의 최신 버전 기준을 따른다.
`git-ref`는 `ref`에 기록한 Git 참조를 가리킨다.

## 어댑터 사용

| 설치할 어댑터 | 준비하고 사용할 외부 리소스 |
|---|---|
| [`openspec-workflow`](../skills/adapters/openspec-workflow/SKILL.md) | 공식 OpenSpec CLI. 대상 저장소의 OpenSpec 도입이나 기존 변경을 다룰 때 사용 |
| [`ste-ko`](../skills/adapters/ste-ko/SKILL.md) | `beamonic/ste-ko`의 규격과 참조 문서. 한국어 기술 문서의 작성과 수정에 사용 |
| [`taste-windows-runtime`](../skills/adapters/taste-windows-runtime/SKILL.md) | 원본 Taste 플러그인과 Windows의 Chrome 또는 Edge. Taste의 브라우저 검사 명령을 실행할 때 사용 |
| [`humanize-windows-runtime`](../skills/adapters/humanize-windows-runtime/SKILL.md) | 원본 `humanize-korean` 스킬과 Python. Windows에서 준비·윤문·검증 단계에 쓸 경로와 실행 파일을 정할 때 사용 |

`ste-ko`의 `SKILL.md`는 `beamonic/ste-ko`의 기본 브랜치에 있는 `SPEC.md`, `dictionary.md`, `tasks.md`를 가리킨다.
원본 저장소와 다른 참조 문서의 경로는 매니페스트의 `references.ste-ko`에서 확인한다.

## 개발 도구와 스킬의 사용 범위

| 리소스 | 사용하는 작업 |
|---|---|
| CodeGraph | `.codegraph/`가 있는 저장소에서 호출 관계와 여러 모듈에 걸친 영향 범위를 탐색 |
| Context7 | 실제 의존성 버전을 기준으로 라이브러리나 프레임워크의 API와 설정을 확인 |
| Microsoft Learn MCP | 대상 버전에 맞는 .NET, ASP.NET Core, C#, Windows 또는 PowerShell의 공식 자료를 조회 |
| NuGet MCP | 작업에 필요한 패키지 버전, 호환성, 피드와 의존성 그래프를 확인 |
| `feature-sliced-design` | FSD 채택을 확인한 저장소에서 파일 배치, 슬라이스, 공개 API와 import 경계를 검토 |
| Taste Skill | 웹사이트를 만들거나 시각 디자인을 개선 |
| [`korean-typography`](../skills/custom/korean-typography/SKILL.md) | 한국어 웹·앱 UI의 서체, 혼합 조판, 줄바꿈과 글꼴 로딩을 확인 |

파일 경로를 알거나 정확한 문자열을 찾을 때는 파일 읽기와 텍스트 검색을 사용한다.
문서 도구에서 대상 버전을 지원하지 않으면 공식 문서와 소스로 확인한다.
개발환경을 바꾸거나 산출물을 보관할 때는 [개발환경과 저장소 산출물](repository-workflows.md)을 참고한다.

## 검증 기록

다음 보고서는 각 날짜에 수행한 실험과 당시 환경을 기록한다.

- Taste Windows에서 Edge 런처 재실행을 재현한 조건과 게이트 검사 결과. [Windows 실행 호환 보고서](history/taste-windows-runtime-2026-11-16.md)
- 한글 글리프에 실제 적용된 서체와 화면 폭별 렌더링 결과. [한글 타이포그래피 보고서](history/korean-typography-2026-11-16.md)
- FSD 스킬의 원본 무결성과 채택 여부에 따른 선택 시도. [FSD 검토 보고서](history/fsd-skill-2026-11-17.md)
- 새 CLI 세션에서의 도구 선택과 실제 문서 조회 결과. [Microsoft Learn MCP 보고서](history/microsoft-learn-2026-11-17.md)
- 별도 .NET 런타임에서의 NuGet 조회 결과와 대상 .NET 8 프로젝트의 파일 해시 확인. [NuGet MCP 보고서](history/nuget-mcp-2026-11-17.md)
