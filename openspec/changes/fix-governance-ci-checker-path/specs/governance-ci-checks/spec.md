# Spec Delta

## MODIFIED Requirements

### Requirement: Verify checker availability before inspecting the pull request

워크플로는 PR 검사 전에 지정한 공통 checkout에서 검사기를 불러와야 한다(MUST).
워크플로는 다음 목록에서 존재하는 첫 검사기 경로를 선택해야 한다(MUST).
검사기를 불러오지 못하면 워크플로는 실패 상태를 반환해야 한다(MUST).

1. `governance/plugin/skills/repo-governance/scripts/check.mjs`
2. `governance/skills/repo-governance/scripts/check.mjs`
3. `governance/packages/repo-governance/plugin/skills/repo-governance/scripts/check.mjs`

#### Scenario: 공개 템플릿이 지원하는 위치에서 검사기를 읽음

- **GIVEN** 공통 checkout의 `plugin/` 또는 checkout 루트 중 한 곳에 검사기 파일이 있다.
- **WHEN** 워크플로가 고정한 공통 checkout에서 검사기를 찾는다.
- **THEN** 워크플로는 검사기 파일이 있는 이전 배치를 사용한다.

#### Scenario: 여러 후보에서 첫 번째 검사기를 선택함

- **GIVEN** 세 후보 모두에 검사기 파일이 있다.
- **WHEN** 워크플로가 공통 checkout에서 검사기를 찾는다.
- **THEN** 워크플로는 `plugin/` 아래의 검사기를 불러온다.

#### Scenario: 앞 후보에 디렉터리만 있음

- **GIVEN** 공통 checkout에 `plugin/` 디렉터리가 있고 그 아래에는 검사기 파일이 없다.
- **AND** checkout 루트와 `packages/repo-governance/plugin/`에는 각각 검사기 파일이 있다.
- **WHEN** 워크플로가 공통 checkout에서 검사기를 찾는다.
- **THEN** 워크플로는 checkout 루트 아래의 검사기를 불러온다.

#### Scenario: 공개 마켓플레이스 배치로만 검사기가 제공됨

- **GIVEN** 공통 checkout에서는 `packages/repo-governance/plugin/`에만 검사기 파일이 있다.
- **WHEN** 워크플로가 고정한 공통 checkout에서 검사기를 찾는다.
- **THEN** 워크플로는 공개 마켓플레이스 배치의 검사기를 불러온다.

#### Scenario: 세 후보 모두에 검사기가 없음

- **WHEN** 공통 checkout에 후보 검사기 경로가 하나도 없다.
- **THEN** 워크플로는 PR 검사 전에 `The fixed governance checkout does not contain the repo-governance checker.` 오류로 실패한다.

#### Scenario: 선택한 검사기를 불러오지 못함

- **GIVEN** 첫 번째로 찾은 검사기 파일에는 구문 오류가 있고 뒤 후보에는 유효한 검사기가 있다.
- **WHEN** 워크플로가 선택한 검사기를 불러온다.
- **THEN** 워크플로는 PR 검사 전에 해당 오류로 실패한다.
