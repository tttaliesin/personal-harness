# Microsoft Learn MCP 등록과 문서 조회 확인

2026년 11월 17일 Homelab Desktop과 Roylabs Desktop에 Microsoft Learn MCP를 추가했다.
사용자 요청은 두 PC 적용, 필요시 자율 선택, 프로젝트 등록·지침 반영과 main 커밋·푸시다.

## 등록 방식

| 항목 | 값 |
|---|---|
| MCP 이름 | `microsoft-learn` |
| 공식 endpoint | `https://learn.microsoft.com/api/mcp` |
| 연결 방식 | Streamable HTTP |
| 등록 위치 | `registry.toml`의 `[[mcp]]` |
| 별도 의존성 패키지·사용자 스킬 | 없음 |
| registry SHA256 | `e5e7231870a64972e9646a6c5bec9be2fcce05f1bb7d2a824102c8dad51cf56b` |
| MCP 선언 SHA256 | `7722fe1ee047d8172b09946d5721d307f1fe98ca6f38045fcc1be26d55040f80` |

[공식 developer reference](https://learn.microsoft.com/en-us/training/support/mcp-developer-reference)의 원격 서버를 등록했다.
기존 HTTP MCP 지원을 사용했으며 설치기 구현은 변경하지 않았다.
lock의 해시는 연결 선언을 식별하며 원격 서버의 코드나 문서 내용을 고정하지 않는다.
기존 Context7·Taste·agent-desktop·CodeGraph·OpenSpec의 고정 버전과 출처 기록은 유지했다.

## 실제 적용과 연결

| 확인 대상 | Homelab | Roylabs |
|---|---|---|
| 적용 계획 | `config.toml`, `AGENTS.md` 두 파일 | `config.toml`, `AGENTS.md` 두 파일 |
| root `task apply` / `task check` | 성공, 잔여 변경·누락 0개 | 성공, 잔여 변경·누락 0개 |
| `codex mcp get microsoft-learn --json` | 활성, Streamable HTTP | 활성, Streamable HTTP |
| `initialize` / `tools/list` | HTTP 200, 도구 3개 | HTTP 200, 도구 3개 |
| 실제 `microsoft_docs_search` | HTTP 200, 공식 문서 반환 | HTTP 200, 공식 문서 반환 |
| 추가한 MCP를 제외한 기존 설정 | 적용 전후 동일 | 적용 전후 동일 |
| repo-governance 설치 파일 | 해당 경로 없음 | 83개 파일 해시 동일 |

두 PC는 각자의 기존 PersonalHarness 상태 경로를 사용했다.
기존 설정 전체에서 `mcp_servers.microsoft-learn`만 제외해 비교했다.
따라서 기존 hook 선언·신뢰 값과 앱 런타임 설정도 동일함을 확인했다.
사용자 지침은 Microsoft Learn 블록을 제외하면 적용 전 내용과 동일했다.
적용 뒤 사용자 지침 파일 SHA256은 두 PC 모두 `48232ac5a3c08ee50c89513cf96fcdc4efee7a3a917c1156aebf29649e0bf519`였다.
repo-governance 개발 소스에는 쓰기 작업을 수행하지 않았다.

연결 시 반환된 서버 이름은 `Microsoft Learn MCP Server`, 버전은 `1.0.0`이었다.
협상한 MCP 프로토콜 버전은 `2025-03-26`이었다.
제공 도구는 `microsoft_docs_search`, `microsoft_code_sample_search`, `microsoft_docs_fetch`였다.
각 PC에서 도구 목록과 인수 스키마를 조회한 뒤 일반 .NET 8 Windows 서비스 질문으로 문서 검색을 실행했다.
인증 정보·비공개 코드·대화 전체는 전송하지 않았다.

## 자율 선택 확인 범위

공통 지침은 Microsoft 공식 API·설정·버전별 동작·예제가 필요할 때 자율적으로 선택하도록 한다.
실제 대상 버전을 확인하고 현대 .NET과 .NET Framework를 구분한다.
Context7과의 고정 호출 순서나 작은 수정의 선행 조회를 요구하지 않는다.
도구 실패 시 공식 문서·소스·로컬 검사로 계속한다.

각 PC의 새 CLI 세션에 .NET 8 Worker Service의 Windows 서비스 배포 방법을 질문했다.
질문에는 Microsoft Learn·MCP·도구 호출·문서 검색 지시를 넣지 않았다.
파일 수정·패키지 설치·서비스 등록은 금지하고 답변만 요청했다.
기존 사용자 설정을 사용했으며 `codex exec --ephemeral --json --skip-git-repo-check --sandbox read-only`로 대화 파일을 남기지 않았다.
Homelab은 한국어 질문, Roylabs는 같은 주제의 영어 질문을 사용했다.

Homelab은 Microsoft Learn 도구를 5회, Roylabs는 4회 성공적으로 호출했다.
두 PC 모두 검색·코드 예제·본문 조회 도구를 자율적으로 사용하고 답변을 완료했다.
설치 작업을 진행한 현재 Desktop 대화에도 세 도구가 노출됐으며 실제 MCP 호출이 성공했다.
Roylabs Desktop의 별도 새 GUI 대화는 이번 범위에서 검증하지 않았다.
이 사례는 일반적인 선택률이나 개발 정확도·속도 향상을 입증하지 않는다.

## 저장소 검증

기존 테스트에 있던 실제 프로젝트의 MCP 목록이 비어 있다는 전제를 제거했다.
MCP 종류별 정규화와 빈 registry 동작을 검증하는 독립 테스트는 유지했다.
수정 후 registry 테스트 13개가 통과했다.
전체 `task test` 재실행은 285개 테스트를 실행해 실패 없이 끝났다.
그중 2개는 환경 조건으로 생략됐으며 283개가 통과했다.

Roylabs의 작업 전용 임시 소스·로그·테스트 파일 53개를 정리했다.
Homelab의 작업 전용 임시 소스·로그·테스트 파일도 검증 기록 하나로 요약한 뒤 정리했다.
실제 적용 백업과 원래 의존성 lock의 복구용 사본은 각 PC에 보관한다.
