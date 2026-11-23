# Spec Delta

## MODIFIED Requirements

### Requirement: Describe the project and guide the reader's first action

README는 프로젝트 이름과 구체적인 목적을 먼저 밝히고 독자에게 필요한 문서, 데모 또는 퀵스타트 링크를 앞부분에 제공해야 한다(MUST).
퀵스타트는 독자가 실제로 사용하는 진입점에 맞춰야 한다(MUST).
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

#### Scenario: Published package, plugin, or release bundle

- **WHEN** 공개 패키지, 플러그인 또는 릴리스 번들의 퀵스타트를 작성한다.
- **THEN** 해당 배포물에 포함되는 파일을 기준으로 설치 명령과 사용 예를 확인한다.
- **AND** 기여자용 설정이나 빌드 절차의 독자가 다르면 해당 문서를 별도로 연결한다.

### Requirement: Use a readable README format

README에는 대상 저장소의 Markdown 규약을 적용해야 한다(MUST).

#### Scenario: Relevant visuals and companion documents

- **WHEN** 프로젝트를 소개할 README의 표현 방식과 링크를 고른다.
- **THEN** 프로젝트 식별에 도움이 되는 기존 시각 자산을 사용한다.
- **AND** 동작 이해에 도움이 될 때 예시, 스크린샷 또는 짧은 다이어그램을 사용한다.
- **AND** 관련 라이선스, 기여 안내, 변경 이력은 해당 문서로 연결한다.

### Requirement: Verify README links and usage

README의 상대 링크는 README의 위치를 기준으로 해석해야 한다(MUST).
명령 옵션과 경로는 대상 진입점에서 확인하고 수행한 검사를 보고해야 한다(MUST).

#### Scenario: README has local links and usage instructions

- **WHEN** 로컬 문서를 연결하고 실행 방법을 제시하는 README를 검토한다.
- **THEN** README가 있는 디렉터리를 기준으로 상대 링크의 대상이 있는지 확인한다.
- **AND** 해당 진입점이 명령 옵션과 경로를 지원하는지 확인한다.

#### Scenario: Rendered preview is available

- **GIVEN** README에서 확인할 사항에 렌더링이 포함된다.
- **WHEN** 수정한 README의 렌더링을 미리 볼 수 있다.
- **THEN** 미리보기로 렌더링을 검사하고 수행한 검사를 보고한다.
