# Development tool routing

## Purpose

코드 관계 탐색에는 저장소의 기존 인덱스를 활용한다.
지속적으로 관리할 요구사항과 변경은 대상 저장소에서 채택한 OpenSpec 절차를 따른다.

## Requirements

### Requirement: Autonomous task selection

에이전트는 저장소 루트에 `.codegraph/`가 있고 심볼 관계, 호출 경로 또는 모듈 간 구조를 파악하는 데 도움이 될 때 CodeGraph를 자율적으로 선택해야 한다(MUST).
알려진 파일이나 정확한 문자열을 확인하는 작업은 직접 읽기나 텍스트 검색으로 진행해야 한다(MUST).
인덱스가 없거나 CodeGraph가 필요한 근거를 제공하지 못하면 에이전트는 직접 읽기와 검색으로 작업을 이어가야 한다(MUST).
새 인덱스 생성은 사용자가 요청한 범위에서만 수행해야 한다(MUST).

#### Scenario: 기존 인덱스로 호출 경로 탐색

- **GIVEN** 저장소 루트에 `.codegraph/`가 있다.
- **WHEN** 변경 범위를 확인하려면 여러 모듈에 걸친 호출 경로를 파악해야 한다.
- **THEN** 에이전트는 CodeGraph를 사용해 관련 호출 경로를 탐색한다.

#### Scenario: Read a known file

- **WHEN** 알려진 파일을 읽거나 정확한 문자열을 검색하면 요청에 답할 수 있다.
- **THEN** 에이전트는 필요한 파일을 바로 읽거나 문자열을 검색한다.

#### Scenario: 그래프에서 근거를 얻기 어려운 작업

- **WHEN** 저장소에 `.codegraph/`가 없거나 CodeGraph 결과를 사용할 수 없다.
- **THEN** 에이전트는 관련 파일과 텍스트 검색 결과로 탐색을 이어간다.

### Requirement: Repository adoption scope

에이전트는 OpenSpec 도입 요청, 기존 OpenSpec 변경 또는 지속적인 명세가 필요한 OpenSpec 저장소의 기능·구조 작업에서 `openspec-workflow`를 선택해야 한다(MUST).
산출물은 CLI가 확인한 루트에서 해당 저장소의 스키마와 산출물 경로를 따라 작성해야 한다(MUST).
새 루트는 대상 저장소에 OpenSpec 루트가 없고 사용자가 도입을 요청한 경우에만 초기화해야 한다(MUST).

#### Scenario: Work outside an initialized project

- **GIVEN** 대상 저장소에 OpenSpec 루트가 없다.
- **WHEN** 사용자가 설명이나 작은 수정을 요청한다.
- **THEN** 에이전트는 해당 저장소의 기존 절차로 작업을 진행한다.

#### Scenario: Resolve an existing root

- **GIVEN** CLI가 상위 저장소의 OpenSpec 루트 또는 선택한 스토어를 확인했다.
- **WHEN** 에이전트가 OpenSpec 산출물을 작성한다.
- **THEN** 에이전트는 확인된 루트와 스키마가 정한 산출물 경로를 사용한다.

### Requirement: 구현 완료와 아카이브 조건

구현 요청의 범위에서 사용할 OpenSpec 산출물이 준비되면 에이전트는 구현과 관련 검증을 이어가야 한다(MUST).
에이전트는 작업 항목의 구현과 관련 검증을 마친 뒤 완료로 표시해야 한다(MUST).
에이전트는 작성하거나 구현을 마친 변경과 아카이브할 변경을 공식 CLI로 엄격 검증해야 한다(MUST).
검증 결과를 보고할 때는 명세 검증과 저장소 동작 검사의 결과를 각각 밝혀야 한다(MUST).
아카이브는 사용자 요청 또는 저장소 절차가 허용한 경우에만 수행해야 한다(MUST).
아카이브 전에 구현과 관련 검증을 끝내고 변경의 모든 작업 항목을 완료해야 한다(MUST).
아카이브 대상 변경은 엄격 검증을 통과해야 한다(MUST).

#### Scenario: Continue an authorized implementation

- **GIVEN** 사용자가 구현을 요청했고 필요한 OpenSpec 산출물이 준비됐다.
- **WHEN** 에이전트가 구현할 변경의 범위를 확인한다.
- **THEN** 에이전트는 허용된 범위에서 구현과 관련 검증을 이어간다.

#### Scenario: 변경 아카이브

- **GIVEN** 아카이브가 허용됐고 구현, 변경의 작업 항목 및 관련 검증을 완료했다.
- **WHEN** `openspec validate <change> --strict --json`이 통과한다.
- **THEN** `openspec archive <change> --json`으로 메인 명세를 갱신하고 변경을 보관한다.

#### Scenario: 엄격 검증 실패

- **WHEN** 아카이브 대상 변경의 엄격 검증이 실패한다.
- **THEN** 에이전트는 변경을 기존 위치에 두고 실패 항목을 확인한다.
