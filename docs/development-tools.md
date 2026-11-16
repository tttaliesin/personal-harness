# CodeGraph와 OpenSpec 사용

CodeGraph는 코드의 관계를 찾고 OpenSpec는 요구사항과 변경 진행 상태를 남긴다.
모델은 자연어로 요청받은 작업의 목적에 따라 두 도구를 선택한다.
스킬 이름이나 슬래시 명령을 직접 입력할 필요는 없다.

| 도구 | 사용하는 상황 | 준비 조건 |
|---|---|---|
| CodeGraph | 호출 관계, 영향 범위, 여러 모듈의 구조 탐색 | 해당 저장소에 `.codegraph/` 인덱스가 있음 |
| OpenSpec | 기존 변경 이어가기, 지속적인 요구사항이 필요한 기능·구조 변경 | 해당 저장소에서 OpenSpec 도입을 요청했거나 이미 사용 중임 |

알려진 파일 읽기와 정확한 텍스트 검색은 바로 수행한다.
설명, 작은 수정, 기계적인 편집에는 별도의 명세 변경을 요구하지 않는다.
구현을 요청하면 필요한 설계와 구현·검증을 같은 작업에서 이어갈 수 있다.
사용자가 결정해야 할 중요한 모호함이나 실제 권한 경계가 있을 때만 해당 부분을 확인한다.
기존 repo-governance와 저장소 자체의 개발 규칙은 유지한다.

```mermaid
flowchart TD
    T[자연어 작업 요청] --> C{작업에 필요한 정보}
    C --> D[직접 읽기와 텍스트 검색]
    C --> G[CodeGraph로 관계 탐색]
    C --> S[OpenSpec로 요구사항과 진행 상태 관리]
    G -->|인덱스가 없거나 부족함| D
    S --> I[요청 범위에 맞게 설계와 구현]
    D --> I
    G --> I
    I --> V[실제 코드 검증과 문서 검증]
```

## 설치와 갱신

`task install` 또는 `task update`는 두 CLI의 npm 최신 안정판을 조회한다.
정확한 버전과 배포 integrity를 확인한 뒤 각각 `state/tools/codegraph`와 `state/tools/openspec`에 설치한다.
저장소에서 설치할 때의 기본 상태 경로는 `.local`이다.
한 명령 설치에서는 `%LOCALAPPDATA%/PersonalHarness/state`를 사용한다.
각 PC의 기존 경로 덮어쓰기는 보존한다.

`openspec-workflow`는 `~/.agents/skills`에 배포한다.
실제 CLI가 PATH 밖에 있으면 생성된 사용자 지침의 `Local tool executables`에 실행 경로를 기록한다.
이 기록은 셸이나 실행 중인 Codex의 PATH를 바꾸지 않는다.
OpenSpec는 CLI로 사용하며 추가 MCP나 hook을 등록하지 않는다.

기존 lock에 OpenSpec가 없으면 `-Locked`로 새 도구를 추가하지 않는다.
일반 `task update`가 새 버전을 조회하고 OpenSpec를 포함한 lock을 만든다.
임시 프로필 테스트와 계획 조회는 실제 PC에 적용한 결과와 구분한다.

## 저장소에 도입

모델에게 해당 저장소에서 CodeGraph와 OpenSpec를 사용하도록 요청한다.
인덱싱과 OpenSpec 초기화의 대상은 그 저장소다.
다른 저장소나 사용자 홈을 자동으로 초기화하지 않는다.

CodeGraph는 `codegraph init <repository> --yes`로 처음 인덱스를 만든다.
전체 재구축에는 `codegraph index <repository>`를 사용한다.
정확한 실행 파일은 사용자 지침에 기록된 PC별 위치를 사용한다.
인덱스는 파생 데이터이며 Git에 포함하지 않는다.
변경 이후 관계가 오래되었으면 `codegraph status <repository> --json`과 `codegraph sync <repository>`로 확인·갱신한다.
결론에 중요한 사실은 현재 소스와 관련 검증으로 확인한다.

OpenSpec는 다음 명령으로 프로젝트 구조를 만든다.
기존 OpenSpec 통합이 있다면 초기화가 정리할 파일을 먼저 확인한다.

```text
openspec init --tools none --profile core --no-animation
```

전역 연동 스킬이 Codex 작업 흐름을 제공하므로 프로젝트별 공식 스킬을 추가로 생성하지 않는다.
`openspec/config.yaml`에는 해당 저장소의 schema와 필요한 프로젝트 맥락을 둔다.
명세와 변경 기록은 해당 저장소에서 관리한다.
이미 다른 방식으로 도입한 프로젝트의 통합은 그대로 사용한다.

OpenSpec의 `status`와 `instructions`가 현재 schema의 의존성과 출력 위치를 정한다.
`openspec validate`는 문서의 일관성을 확인한다.
코드 동작은 저장소의 실제 테스트와 실행으로 확인한다.
완료한 변경은 저장소의 완료 절차에 따라 보관한다.

공식 참고: [OpenSpec CLI](https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md), [Codex 지원 방식](https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md), [CodeGraph](https://github.com/colbymchenry/codegraph).
