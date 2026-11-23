# README 작성 지침

## Purpose

`create-readme`는 저장소의 프로젝트 소개 페이지를 작성하거나 크게 개편할 때 독자가 현재 할 수 있는 일을 안내한다.
공개 스킬에는 본문과 레이아웃을 고를 때 참고하는 README 예시가 있다. [스킬 본문](../../../skills/custom/create-readme/SKILL.md) · [README 예시](../../../skills/custom/create-readme/references/examples.md)

## Requirements

### Requirement: Select guidance for a project README

프로젝트의 소개 README를 새로 작성하거나 소개, 섹션 구성, 퀵스타트를 크게 개편할 때 `create-readme`를 선택할 수 있어야 한다(MUST).

#### Scenario: New project landing page

- **WHEN** 사용자가 프로젝트의 첫 README를 작성해 달라고 요청한다.
- **THEN** 저장소와 관련 작업 문서에서 독자, 프로젝트의 목적, 현재 동작을 확인한다.
- **AND** 사용자와 저장소가 위치를 지정하지 않은 경우 저장소 루트에 README를 둔다.

### Requirement: Describe the project and guide the reader's first action

README는 프로젝트 이름과 구체적인 목적을 먼저 밝히고 독자에게 필요한 문서, 데모 또는 퀵스타트 링크를 앞부분에 제공해야 한다(MUST).
도구나 파이프라인의 소개에는 입력, 처리, 결과를 설명해야 한다(MUST).
사용법, 배지와 주장의 근거는 저장소에서 확인할 수 있어야 한다(MUST).

#### Scenario: Runnable project

- **GIVEN** 저장소에 실행할 수 있는 소프트웨어가 있다.
- **WHEN** README의 소개와 퀵스타트를 작성한다.
- **THEN** 지원하는 경로 가운데 가장 짧은 설정과 사용 예를 제시한다.

#### Scenario: Project in design

- **WHEN** 프로젝트가 설계 중인 기능을 README에 소개한다.
- **THEN** 해당 기능을 계획 상태로 표시하고 계획 문서를 연결한다.
- **AND** 상세 결정과 진행 목록은 연결된 문서에 둔다.

### Requirement: Use a readable README format

README에는 GitHub Flavored Markdown을 사용해야 한다(MUST).

#### Scenario: Relevant visuals and companion documents

- **WHEN** 프로젝트를 소개할 README의 표현 방식과 링크를 고른다.
- **THEN** 기존 프로젝트 로고나 아이콘이 있으면 사용한다.
- **AND** 동작 이해에 도움이 될 때 예시, 스크린샷 또는 짧은 다이어그램을 사용한다.
- **AND** 관련 라이선스, 기여 안내, 변경 이력은 해당 문서로 연결한다.

### Requirement: Verify README links and usage

README의 로컬 링크가 열리는지 확인해야 한다(MUST).
명령, 예시, 시각 자료가 저장소의 내용과 일치하는지 확인해야 한다(MUST).
렌더링을 확인했는지 보고해야 한다(MUST).

#### Scenario: README has local links and usage instructions

- **WHEN** 로컬 문서를 연결하고 실행 방법을 제시하는 README를 검토한다.
- **THEN** 로컬 링크의 경로와 명령, 사용 예가 저장소에서 확인된다.
- **AND** 시각 자료가 제시한 동작과 일치하는지 확인한다.

#### Scenario: Rendered preview is available

- **WHEN** 수정한 README의 렌더링을 미리 볼 수 있다.
- **THEN** 첫 화면을 확인하고 렌더링 확인 여부를 보고한다.
