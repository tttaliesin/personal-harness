# CodeGraph와 OpenSpec 적용 결과

2026년 11월 16일 두 PC에 OpenSpec 사용 기반을 적용했다.
CodeGraph 1.6.2는 기존 설치와 MCP 구성을 유지했다.

| 확인 항목 | Homelab Desktop | Roylabs Desktop |
|---|---|---|
| CodeGraph CLI | 1.6.2 | 1.6.2 |
| OpenSpec CLI | 2.0.0 | 2.0.0 |
| 공통 OpenSpec 선택 지침 | 적용 | 적용 |
| `openspec-workflow` 사용자 스킬 | 적용 | 적용 |
| 적용 후 남은 파일 변경 | 0 | 0 |
| 누락된 의존성 | 0 | 0 |
| 기존 Codex config 바이트 | 동일 | 동일 |
| hook·governance를 포함한 보존 대상 파일 | 1개 동일 | 80개 동일 |

두 PC에서 생성된 지침과 스킬의 SHA256이 일치했다.
OpenSpec는 관리 상태의 독립적인 npm prefix에 설치했다.
기존 CodeGraph, plugin 설정과 repo-governance 파일은 수정하지 않았다.
프로필 변경은 사용자 지침과 새 연동 스킬에 한정했다.

## 실제 동작 확인

Homelab에서는 설치된 OpenSpec CLI로 이 저장소의 변경 상태를 조회했다.
`task check -- -StateRoot <managed-state>`는 파일 변경 0개와 누락 의존성 0개를 반환했다.
이 저장소에 CodeGraph 인덱스를 만들고 MCP를 통해 설치·지침 생성 관련 심볼을 조회했다.
인덱스 생성 전후 Git hook의 파일 목록과 내용 및 사용자 지침이 동일했다.

Roylabs에서는 실제 설치된 CLI로 버전을 확인했다.
임시 프로젝트에서 OpenSpec 초기화, 변경 생성과 상태 조회를 수행했다.
새 변경의 proposal이 준비 상태로 조회됐고 임시 프로젝트는 정리됐다.
Roylabs에는 이 프로젝트의 Git checkout이 없어 이 저장소의 인덱스를 생성하지 않았다.

## 코드와 스킬 검증

`task test`는 281개 테스트를 실행해 성공했다.
Windows 파일 symlink 권한과 비 Windows 경로 조건에 따른 2개 테스트는 건너뛰었다.
이전 lock 재현, 일반 update의 OpenSpec 추가, Node 요구사항, package identity·integrity·bin 검증과 특수문자 경로 실행을 포함한다.
설정 보존, 실패 시 기존 lock 유지, 사용자 스킬 배포와 반복 적용도 확인했다.

공식 skill validator가 연동 스킬을 통과시켰다.
독립 소스 검토는 권한 경계와 기존 root·store 처리 및 출력 경로 사용을 확인했다.
이 검토는 자연어 요청에 대한 모델 선택률을 측정한 실행 평가가 아니다.
OpenSpec strict validation은 변경 명세에 issue가 없다고 반환했다.

## 검증의 한계

도구 설치, 명령 실행과 선택 지침의 준비 상태를 검증했다.
일반 개발 작업의 정확도나 완료 시간 향상은 측정하지 않았다.
최상위 npm package integrity 확인은 모든 전이 의존성의 고정을 의미하지 않는다.
CodeGraph MCP 조회 성공은 반환된 모든 관계의 정확성을 보장하지 않는다.
코드 변경의 중요한 판단에는 현재 소스와 실제 동작 검증을 함께 사용한다.
