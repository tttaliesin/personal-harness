# 저장소 규약

## Purpose

작업 에이전트는 공통 `repo-governance` 스킬로 저장소의 실제 자료를 확인한다.
스킬은 이름, 설명, README, 커밋, 브랜치, 풀 리퀘스트와 파일 위치에 K1–K7을 적용하도록 안내한다.

공개 `repo-governance` `0.2.0`을 기준으로 한다. [공개 스킬](https://github.com/tttaliesin/personal-harness/blob/a0eca5178f9b58ad727debaf5686a38076014e9e/packages/repo-governance/plugin/skills/repo-governance/SKILL.md) · [이관 명세와 상세안](https://github.com/tttaliesin/personal-harness/tree/960a8410c913b2a8d107281821925bacb0d58311/plugins/repo-governance/plugin) · [배포 기록](https://github.com/tttaliesin/personal-harness/blob/a0eca5178f9b58ad727debaf5686a38076014e9e/docs/deployment.md#자체-플러그인-소스와-배포본)

## Requirements

### Requirement: Ground drafting and application in repository evidence

작업 에이전트는 요청의 실제 대상과 효과를 식별하고, 해당 규약과 현재 코드·문서·설정·diff에서 확인한 사실로 문안을 작성해야 한다(MUST).

#### Scenario: 검토용 문안 요청

- **WHEN** 사용자가 이름, 문서, 메시지 또는 파일 위치의 제안만 요청한다.
- **THEN** 에이전트는 확인한 근거와 검토할 문안을 제공하는 것으로 작업을 마친다.

#### Scenario: 적용에 필요한 핵심 사실이 미확인

- **WHEN** 요청한 변경의 대상, 현재 제공 상태, 실제 검증 결과 또는 같은 변경을 적용할 권한이 확인되지 않는다.
- **THEN** 에이전트는 확인한 범위에서 조건부 문안을 제공하고 해당 사실이나 권한에 의존하는 적용을 보류한다.

### Requirement: K1 Reflect actual ownership and adoption in repository names

에이전트는 `분류-대상[-관리범위]`에서 `product`, `infra`, `deploy`, `shared`, `docs`의 실제 유지 책임을 반영해야 한다(MUST).
`shared`에는 공식 도입 형태와 개별 리소스명을 써야 한다(MUST).

#### Scenario: 같은 제품에 별도 운영하는 API가 있음

- **WHEN** 에이전트가 실행 진입점과 운영 자료에서 제품 전체와 API의 독립 관리 범위를 확인한다.
- **THEN** 에이전트는 같은 제품명을 둘째 자리에 두고 별도 API 저장소의 이름에 관리 범위를 붙인다.
- **AND** 사용자 요청에 따라 이름을 적용할 때는 대상 계정이나 조직의 동명 저장소를 확인한다.

#### Scenario: 표기 검사를 통과한 공용 리소스 이름에 개별 이름이 없음

- **WHEN** `shared-plugin`이 기계 표기 검사를 통과하지만 공식 도입 형태와 개별 리소스명을 함께 보여주지 못한다.
- **THEN** 에이전트는 최종 적용을 보류하고 공식 설치 자료와 배포 단위에서 확인할 항목을 제시한다.
- **AND** 한 플러그인에 포함된 스킬과 진단 명령은 공식 도입 단위 하나에 속하는 것으로 판단한다.

### Requirement: K2 Describe the currently available purpose in one line

에이전트는 저장소에서 현재 제공하는 기능과 용도를 짧은 한국어 한 줄로 작성해야 한다(MUST).
끝 마침표는 문체에 맞춰 선택할 수 있다.

#### Scenario: 설계 명세만 공개된 저장소

- **WHEN** README와 현재 진입점에서 설계 명세만 제공하는 상태를 확인한다.
- **THEN** 에이전트는 사용자가 지금 읽을 수 있는 명세의 대상을 설명하고 계획된 실행 기능의 소개를 보류한다.

### Requirement: K3 Show the reader a usable first action

에이전트는 README 첫 부분에서 독자, 제공 내용과 지원하는 첫 행동을 보여주고, 필요한 조건과 확인할 결과를 그 행동 가까이에 배치해야 한다(MUST).

#### Scenario: 설치 경로가 있는 플러그인

- **WHEN** 에이전트가 배포 자료와 실행 진입점에서 지원 호스트와 기본 설치·활성화 경로를 확인한다.
- **THEN** 에이전트는 실제 경로와 첫 사용을 한국어로 안내한다.
- **AND** 아직 실행하지 않은 예시는 기대 결과로 표시한다.

#### Scenario: 프로젝트의 README를 일부 수정

- **WHEN** 기존 문서나 제품 디자인에 독자가 사용하는 탐색 경로와 배치가 있다.
- **THEN** 에이전트는 유효한 내용을 보존하고 현재 독자의 시작 경로에 맞춰 예시, 절, 표, 시각 자산을 선택한다.
- **AND** 시각 자산을 쓰면 실제 용도를 나타내는 대체 텍스트를 넣는다.

### Requirement: K4 Describe the staged change with the appropriate commit type

에이전트는 실제 편입할 diff의 목적에 따라 `type[(scope)][!]: 한국어 변경 요약`과 필요한 본문을 작성해야 한다(MUST).

#### Scenario: Markdown으로 유지하는 실행 규칙의 동작 변경

- **WHEN** 편입할 스킬이나 규칙이 기존의 잘못된 동작을 바로잡는다.
- **THEN** 에이전트는 확장자보다 실제 수정 효과를 근거로 `fix`를 선택한다.

#### Scenario: 호환성을 깨는 변경이나 되돌림

- **WHEN** 실제 diff가 호환성을 깨거나 이전 변경을 되돌린다.
- **THEN** 에이전트는 호환성 변경에 `!`와 영향·이행 방법을, 되돌림에 `revert`와 대상·이유를 기록한다.
- **AND** 관련 이슈를 닫는 표기는 커밋이 해당 작업 전체를 해결한다는 사실을 확인한 경우에 사용한다.

### Requirement: K5 Name a new branch for its task and confirmed starting point

에이전트는 작업의 대상과 행동을 보여주는 영문 소문자 케밥 케이스를 제안하고, 새 브랜치를 적용할 때 의도한 기준 ref와 동명 브랜치의 쓰임을 확인해야 한다(MUST).

#### Scenario: 동명 브랜치가 다른 worktree에 있음

- **WHEN** 목록에 제안한 이름이 이미 있고 연결된 worktree가 그 브랜치를 사용한다.
- **THEN** 에이전트는 기존 브랜치의 작업과 기준을 확인하고 해당 작업을 재사용할 수 있는지 설명한다.
- **AND** 기존 브랜치를 선택하는 작업에는 새 이름을 요구할 대상이 없다.

### Requirement: K6 Tie pull request prose and review claims to the current comparison

에이전트는 PR의 목적, 실제 변경, 검증 결과와 필요한 영향을 현재 head와 base의 비교에 맞춰 작성해야 한다(MUST).
일반 설명은 한국어로 쓰고 코드와 오류 메시지는 실제 표기를 사용할 수 있다.

#### Scenario: 검증 일부가 실패하거나 미실행

- **WHEN** 에이전트가 같은 변경의 확인 결과에서 성공, 실패 또는 미실행을 확인한다.
- **THEN** 에이전트는 확인한 대상·방법·결과와 남은 확인을 PR 본문에 기록한다.
- **AND** 검토자가 변경을 식별할 수 있는 제목과 변경 규모에 맞는 본문 배치를 선택한다.

#### Scenario: 기존 PR의 기준 브랜치가 바뀜

- **WHEN** 사용자가 PR의 base 변경이나 머지를 요청한다.
- **THEN** 에이전트는 현재 head·base와 그 비교에 필요한 검증 근거를 다시 확인한다.
- **AND** squash로 남길 메시지를 작성하는 경우 K4를, 편입 파일을 확인하는 경우 K7을 적용한다.

### Requirement: K7 Place files by actual consumers and maintenance responsibility

에이전트는 제품을 만들고 사용하거나 재현하는 데 필요한 원본과 유지 대상 fixture의 소비 경로를 확인해야 한다(MUST).
개인 작업 자료와 재생성 결과에는 Git 제외가 확인된 로컬 위치나 저장소 밖의 위치를 제안해야 한다(MUST).

#### Scenario: 같은 확장자의 제품 fixture와 실행 결과

- **WHEN** 테스트가 읽는 fixture와 실행마다 생기는 결과의 쓰임이 각각 확인된다.
- **THEN** 에이전트는 fixture에 테스트의 소비 경로를, 실행 결과에 확인된 출력 위치를 제안한다.
- **AND** Git 편입은 확인한 추적·제외와 실제 후보를 근거로 판단한다.

#### Scenario: 제품 계약과 개인 상태가 같은 파일에 있음

- **WHEN** 에이전트가 하나의 파일에서 유지할 제품 계약과 개인 상태를 발견하거나 파일의 쓰임을 확인하지 못한다.
- **THEN** 에이전트는 유지 자료의 분리나 쓰임 확인을 제안하고 그 파일의 편입을 보류한다.

### Requirement: Verify the source and scope of convention exceptions

에이전트는 정확한 플랫폼 이름, 외부 기여 관례 또는 호스트의 필수 브랜치 접두어를 적용할 때 실제 출처와 현재 대상·범위를 대조해야 한다(MUST).

#### Scenario: 플랫폼 계약의 실제 원문을 확인함

- **WHEN** 유효한 제품 설정이 지목한 원문에서 현재 대상에 강제하는 이름, 커밋 관례 또는 접두어를 확인한다.
- **THEN** 에이전트는 확인한 범위에 그 조건을 적용하고 일반 규약으로 판단할 항목은 계속 확인한다.

#### Scenario: 승인 표시만 있는 예외

- **WHEN** `approved: true`만 주어지고 현재 대상에 효력이 있는 원문이나 실증 자료가 없다.
- **THEN** 에이전트는 일반 권고안을 제시하거나 예외를 판단하는 데 필요한 근거를 요청한다.
