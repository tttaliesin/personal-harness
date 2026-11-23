# 거버넌스 CI 검사

## Purpose

팀이 선택한 GitHub Actions 워크플로에서 고정한 공통 검사기와 PR의 실제 리비전으로 기계 조건을 확인한다.
PR 문구와 파일 편입 판단에 사용한 비교 기준을 각각 결과에 남긴다.

공개 `repo-governance` `0.2.0`을 기준으로 한다. [공개 CI 템플릿](https://github.com/tttaliesin/personal-harness/blob/a0eca5178f9b58ad727debaf5686a38076014e9e/packages/repo-governance/plugin/templates/github-actions.yml) · [공개 CI 테스트](https://github.com/tttaliesin/personal-harness/blob/a0eca5178f9b58ad727debaf5686a38076014e9e/packages/repo-governance/tests/ci.test.mjs)

## Requirements

### Requirement: Require an explicitly adopted workflow and a fixed checker revision

선택형 워크플로는 팀이 제품 저장소에 배치한 경우 `pull_request` 이벤트에서 동작해야 한다(MUST).
공통 검사기는 지정한 공통 저장소와 전체 40자리 소문자 16진수 커밋 OID에 고정해야 한다(MUST).

#### Scenario: PR 이벤트와 고정된 공통 소스를 받음

- **WHEN** 워크플로가 활성화되고 `opened`, `synchronize`, `reopened`, `edited` 중 하나의 이벤트가 온다.
- **THEN** 워크플로는 이벤트의 head를 제품 checkout에 사용하고 `REPO_GOVERNANCE_REPOSITORY`와 `REPO_GOVERNANCE_REF`로 공통 checkout을 선택한다.
- **AND** 권한은 `contents: read`를 사용하며 공통 저장소에 별도 읽기 권한이 필요하면 읽기 토큰을 받을 수 있다.

#### Scenario: 고정 커밋이 아닌 이름을 지정

- **WHEN** 검사기 ref가 비어 있거나 브랜치·태그 이름이나 축약 OID다.
- **THEN** 워크플로는 공통 검사기를 불러오기 전에 오류로 끝난다.

### Requirement: Verify checker availability before inspecting the pull request

워크플로는 PR 검사 전에 지정한 공통 checkout에서 검사기를 불러와야 한다(MUST).
검사기를 불러오지 못하면 워크플로는 실패 상태를 반환해야 한다(MUST).

#### Scenario: 공개 템플릿이 지원하는 위치에서 검사기를 읽음

- **WHEN** 공개 `0.2.0`의 템플릿이 지원 위치에 검사기가 있는 공통 checkout을 읽는다.
- **THEN** `plugin/` 디렉터리가 있으면 그 아래의 검사기를 불러온다.
- **AND** `plugin/` 디렉터리가 없으면 checkout 루트 아래의 경로를 사용한다.

#### Scenario: 공개 마켓플레이스 배치로만 검사기가 제공됨

- **WHEN** 고정한 공통 checkout이 공개 Personal Harness 커밋 `a0eca5178f9b58ad727debaf5686a38076014e9e`이며 검사기가 `packages/repo-governance/plugin/`에 있다.
- **THEN** 공개 `0.2.0` 템플릿은 현재의 검색 위치에서 검사기를 찾지 못해 검사 전에 실패한다.

### Requirement: Check PR metadata and compare committed paths against the unique merge base

워크플로는 이벤트의 head와 base가 로컬에서 읽을 수 있는 완전한 commit인지 검증해야 한다(MUST).
K6에는 실제 base OID를, K7의 `revision` 비교에는 유일한 merge-base를 써야 한다(MUST).

#### Scenario: head와 base가 공통 조상 뒤에서 갈라짐

- **WHEN** PR과 base가 서로 다른 변경을 담고 유일한 공통 merge-base를 확인할 수 있다.
- **THEN** K6는 이벤트의 PR 번호·제목·본문과 head·base를 받는다.
- **AND** K7은 PR head와 유일한 merge-base 사이에서 편입할 파일을 비교한다.
- **AND** 결과의 PR base와 파일 비교 기준은 각각 사용한 OID를 표시한다.

#### Scenario: 이벤트 리비전 또는 비교 기준을 검증할 수 없음

- **WHEN** head나 base가 전체 commit OID가 아니거나, 필요한 객체가 없거나, merge-base가 없거나 여러 개다.
- **THEN** 워크플로는 검사 요청을 실행하기 전에 실패한다.

### Requirement: Report both mechanical checks with optional product input

워크플로는 제품 checkout에 `.repo-governance/product.json`이 있으면 제품 입력으로 사용해야 한다(MUST).
워크플로는 공통 검사기로 PR과 파일 범위 검사 결과를 반환해야 한다(MUST).
검사 결과에 0이 아닌 종료 코드가 있으면 워크플로는 실패해야 한다(MUST).

#### Scenario: 제품 입력 없이 유효한 PR을 검사

- **WHEN** 제품 입력 파일이 없고 PR 자료와 리비전을 확인했다.
- **THEN** 워크플로는 공통 기본값으로 두 검사를 실행하고 각 결과를 JSON 한 줄로 출력한다.

#### Scenario: 변경한 파일이 선언 출력이거나 PR 문구에 위반이 있음

- **WHEN** 선택한 제품 입력이 선언한 출력이 현재 PR의 편입 후보에 들어 있거나 실제 PR 자료가 K6 기계 조건을 어긴다.
- **THEN** 해당 검사는 위반을 보고하고 워크플로는 실패 상태를 반환한다.
- **AND** PR의 실제 머지 가능 여부는 저장소가 사용하는 GitHub 조건에서 결정한다.
