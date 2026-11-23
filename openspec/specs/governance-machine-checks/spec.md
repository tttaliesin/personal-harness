# 거버넌스 기계 검사

## Purpose

직접 검사, 하네스 연결과 CI에서 같은 기계 조건을 확인할 수 있도록 읽기 전용 검사 계약을 제공한다.
호출자는 판정, 실제 읽은 자료와 에이전트가 확인할 근거를 결과에서 확인한다.
검사기는 모델 호출과 원격 조회 없이 주어진 자료를 읽는다.

공개 `repo-governance` `0.2.0`을 기준으로 한다. [검사 계약](https://github.com/tttaliesin/personal-harness/blob/a0eca5178f9b58ad727debaf5686a38076014e9e/packages/repo-governance/plugin/skills/repo-governance/references/checker.md) · [v3 입력 검증](https://github.com/tttaliesin/personal-harness/blob/a0eca5178f9b58ad727debaf5686a38076014e9e/packages/repo-governance/plugin/skills/repo-governance/scripts/contracts.mjs)

## Requirements

### Requirement: Accept the strict version 3 check request

직접 CLI는 Node.js 22.18 이상에서 stdin으로 JSON 요청 한 건을 받아야 한다(MUST).
검사기는 Git 후보를 읽을 때 Git을 사용해야 한다(MUST).
요청은 `schemaVersion: 3`, `operation: "check"`, `check`, `sources`, `context`를 사용해야 한다(MUST).
`context`에는 `repository`, `bundlePath`, `productPath`, `baseRef`만 지정할 수 있다.

#### Scenario: 규칙에 맞는 Source를 제공

- **WHEN** 호출자가 다음 표에 맞는 Source를 제공한다.
- **THEN** 검사기는 해당 규칙에 필요한 자료를 선택한다.
- **AND** `text`는 문자열 `text`를, `file`은 `path`를, `revision`은 `revision`을 요구하며 `index`에는 별도 값이 필요 없다.

| 검사 | 허용하는 Source |
| --- | --- |
| `name`, `description`, `branch` | `text` 한 개 |
| `readme` | `text`, `file`, `index` 중 한 개 |
| `commit-message` | `text` 또는 `file` 한 개 |
| `pull-request` | `pr` 또는 `pr-create` 한 개 |
| `file-scope` | `index`나 `revision` 한 개 또는 `file` 목록 |

#### Scenario: 직접 검사에 PR 자료를 제공

- **WHEN** 입력이 `pr` 또는 `pr-create`다.
- **THEN** 검사기는 두 형식 모두에 전체 `headOid`, `baseOid`, 문자열 `title`, `body`를 요구한다.
- **AND** `pr`은 양의 정수 `number`를, `pr-create`는 GitHub `repository`의 `owner/repo`, 전체 `refs/heads/…` 형태의 `headRef`·`baseRef`, 불리언 `draft`를 요구한다.
- **AND** 관측값은 호출자가 제공한 PR 자료와 그 식별값을 나타낸다.

#### Scenario: 필수 값이 빠진 지원 요청

- **WHEN** 호출자가 bundle을 지정하지 않거나 지원하는 요청에 필수 값이 빠져 있다.
- **THEN** 검사기는 부족한 자료와 `needs-context`를 반환한다.

#### Scenario: 중복 옵션이나 지원하지 않는 계약

- **WHEN** 호출자가 `--bundle`, `--repository`, `--product` 중 하나를 반복하거나 대응하는 JSON 필드와 함께 지정한다.
- **THEN** 검사기는 `error`를 반환한다.
- **AND** 알 수 없는 필드, 지원하지 않는 Source 조합 또는 구형 요청에도 `error`를 반환한다.

### Requirement: Report the mechanical result and observed evidence

직접 CLI는 stdout에 JSON 한 줄을 출력해야 한다(MUST).
응답에는 스키마, 규칙 버전, 검사 종류, `scope: "mechanical"`, 판정, `observed`, `findings`, `semanticChecks`가 있어야 한다(MUST).

#### Scenario: 이름 기계 조건은 충족하나 의미 판단이 남음

- **WHEN** 문법에 맞는 이름을 검사한다.
- **THEN** 검사기는 `pass`와 종료 코드 `0`을 반환하고, 이름의 자리와 실제 충돌을 에이전트가 확인할 질문으로 남긴다.
- **AND** `observed`에는 읽은 대상의 종류, 위치, digest나 OID만 기록한다.

#### Scenario: 확정 위반, 필수 자료 부족, 실행 오류

- **WHEN** 확인된 기계 위반, 필수 자료 누락, 잘못된 형식이나 실행 오류가 각각 발생한다.
- **THEN** 검사기는 각각 `violation`과 `2`, `needs-context`와 `3`, `error`와 `1`을 반환한다.
- **AND** `findings`에는 규칙 ID, 문제 코드, 메시지, 대상을 기록한다.

#### Scenario: 검사 전후 Git 상태를 비교

- **WHEN** 호출자가 파일이나 Git 후보를 검사한 뒤 index, ref와 객체를 다시 확인한다.
- **THEN** 검사 호출의 효과는 후보와 규칙을 읽고 결과를 반환하는 범위에 한정된다.
- **AND** 파일과 텍스트의 SHA-256 및 Git OID는 읽은 자료를 식별한다.

### Requirement: Apply the published name and description mechanical conditions

`name`은 공개 정책의 K1 표기와 첫 분류를 확인하고 `description`은 K2의 한 줄과 작성용 자리표시자를 확인해야 한다(MUST).

#### Scenario: 잘못된 표기와 분류를 구분

- **WHEN** 이름이 소문자 영숫자 케밥 케이스의 최소 두 단어 조건을 어기거나 그 표기를 만족하지만 첫 분류가 허용 목록 밖에 있다.
- **THEN** 검사기는 각각 `name-format`, `name-category`를 보고한다.
- **AND** 유효한 제품 예외의 정확한 이름과 일치하면 이름의 기계 조건을 통과한다.

#### Scenario: 마침표만 다른 두 설명

- **WHEN** 같은 비어 있지 않은 한 줄 설명을 끝 마침표 유무만 바꿔 검사한다.
- **THEN** 두 설명은 같은 판정을 받는다.
- **AND** 빈 설명, 줄바꿈이나 알려진 작성용 자리표시자는 위반으로 보고한다.

### Requirement: Check README structure and relative links for the selected source

`readme`는 표시되는 제목, 빈 절과 표, 닫히지 않은 코드 블록, 작성용 자리표시자, 상대 링크와 앵커를 검사해야 한다(MUST).

#### Scenario: 하위 경로에 놓일 README 초안

- **WHEN** `text` Source에 제품 루트 기준 상대 `path`를 지정하거나 실제 문서를 `file` Source로 제공한다.
- **THEN** 검사기는 해당 문서 위치에서 상대 링크를 해석한다.
- **AND** `text`에 경로를 생략하고 루트를 지정하면 루트의 `README.md` 위치를 사용한다.
- **AND** 위치가 없는 초안에서 상대 대상을 확인해야 하면 필요한 루트를 보고한다.

#### Scenario: 저장소 내부 링크와 코드 예제

- **WHEN** 문서에 깨진 상대 링크나 앵커가 있고 코드 예제에서도 같은 링크 표기를 인용한다.
- **THEN** 검사기는 실제 문서 링크에서 확인한 오류를 보고한다.
- **AND** 코드 예제의 표기는 예제로 해석한다.

### Requirement: Check commit and branch mechanics for the selected input

`commit-message`는 K4 메시지 문법을, `branch`는 K5 이름과 제공받은 Git 기준·동명 ref를 확인해야 한다(MUST).

#### Scenario: 조건부 본문과 이슈 표기

- **WHEN** 최종 커밋 메시지에서 호환성을 깨는 변경이나 `revert`의 본문이 빠졌거나 관련 작업 표기가 잘못됐다.
- **THEN** 검사기는 해당 본문·참조 위반을 보고한다.
- **AND** 임시 메시지 접두어와 선언한 외부 영역 형식을 검사한 경우에도 실제 대상과 외부 관례의 증거 질문을 남긴다.

#### Scenario: 이름은 유효하나 기준이나 사용 상태를 확정해야 함

- **WHEN** 새 이름의 전체 Git ref와 선언된 접두어가 유효하지만 기준 commit을 찾지 못했거나 동명 로컬 브랜치가 있다.
- **THEN** 확인된 다른 위반이 없으면 검사기는 `needs-context`를 반환한다.
- **AND** 명시한 `context.baseRef`가 있으면 제품의 기본 기준보다 우선 사용한다.

### Requirement: Check PR prose and declared output boundaries mechanically

`pull-request`는 K6의 제공된 PR 자료와 문구를, `file-scope`는 K7의 경로 상태 또는 Git 편입 후보를 검사해야 한다(MUST).

#### Scenario: 짧은 PR 본문과 미완성 문구

- **WHEN** 본문에 고정 소제목이 없으나 한 줄 제목과 본문의 기계 조건을 충족한다.
- **THEN** 검사기는 `pass`를 반환한다.
- **AND** 제목이 비어 있거나 여러 줄일 때, 알려진 자리표시자나 열린 코드 블록이 있을 때는 위반을 보고한다.

#### Scenario: 선언한 출력 경계의 쓰기와 편입

- **WHEN** `file` 후보가 실제 추적 경로와 충돌하거나 유효하게 제외되지 않은 선언 출력이다.
- **THEN** 검사기는 추적 충돌 또는 제외 위반을 보고한다.
- **AND** 실제 경로가 경로 해석 전후에 다른 출력 경계에 속하면 그 불일치를 보고한다.
- **AND** `index`나 `revision` 후보에 선언 출력의 추가·수정이 들어 있으면 편입 위반을 보고한다.

#### Scenario: 직접 검사에서 index와 revision을 각각 읽음

- **WHEN** 호출자가 `file-scope`에 실제 저장소와 `index` 또는 `revision`을 각각 제공한다.
- **THEN** 직접 `index` 검사는 현재 HEAD와 index 후보를 비교한다.
- **AND** `revision` 검사는 명시하거나 제품에서 선택한 기준 ref를 사용한다.
- **AND** 기준을 지정하지 않은 `revision` 검사는 첫 부모를 기준으로 쓰고 실제 루트 커밋이면 전체 변경을 사용한다.
- **AND** 읽을 수 없는 Git 객체가 확인에 필요하면 부족한 근거를 보고한다.
