# NuGet package tools

## Purpose

C# 패키지 작업에 필요한 버전, 호환성, 피드 및 의존성 그래프를 확인한다.
패키지 조회와 변경은 대상 프로젝트의 .NET 구성과 개발 규칙을 따른다.

## Requirements

### Requirement: Autonomous scoped selection

에이전트는 C# 패키지 추가나 업데이트 등에서 실제 피드 또는 의존성 그래프 정보가 필요할 때 공식 NuGet MCP를 자율적으로 선택해야 한다(MUST).
에이전트는 작업에 관련된 `*.csproj`, `Directory.Packages.props`, `packages.lock.json`, `NuGet.Config`, `global.json`에서 프로젝트 구성을 확인해야 한다(MUST).
MCP의 패키지 정보는 대상 프로젝트의 제약과 사용자 요청을 기준으로 해석해야 한다(MUST).

#### Scenario: Version information is needed

- **GIVEN** 프로젝트에서 패키지 버전과 피드가 정해져 있다.
- **WHEN** 패키지 변경에 사용할 수 있는 버전이나 호환성을 확인해야 한다.
- **THEN** 에이전트는 실제 프로젝트 구성을 확인하고 NuGet MCP에서 필요한 패키지 정보를 조회한다.

#### Scenario: 프로젝트 파일로 해결할 수 있는 작업

- **WHEN** 대상 파일을 읽거나 작은 기계적 수정을 하는 데 피드나 의존성 그래프 조회가 필요하지 않다.
- **THEN** 에이전트는 프로젝트 파일을 사용해 작업을 진행한다.

### Requirement: Project runtime preservation

NuGet MCP 실행 환경을 정할 때는 대상 프로젝트의 TFM, SDK 및 `global.json`을 유지해야 한다(MUST).
패키지 작업은 해당 프로젝트의 중앙 패키지 관리, 피드와 인증, 배포 경로 및 repo-governance를 따라야 한다(MUST).
패키지 변경 도구는 사용자가 허용한 작업 범위에서만 사용해야 한다(MUST).

#### Scenario: Package work in an existing project

- **GIVEN** NuGet MCP의 실행 환경이 대상 프로젝트의 SDK 또는 런타임과 다르다.
- **WHEN** 에이전트가 대상 프로젝트의 패키지 정보를 조회한다.
- **THEN** 에이전트는 프로젝트에 선언된 TFM과 SDK를 기준으로 패키지 정보를 확인한다.

### Requirement: 확인 가능한 근거로 조회 계속

NuGet MCP가 실패하거나 필요한 정보를 제공하지 못하면 에이전트는 공식 자료와 사용 가능한 NuGet 또는 .NET CLI 검사로 작업을 이어가야 한다(MUST).
에이전트는 확인하지 못한 범위를 밝혀야 한다(MUST).

#### Scenario: The service cannot answer

- **WHEN** 연결이나 인증 문제, 또는 프로젝트 평가에 필요한 SDK 부족으로 MCP에서 필요한 정보를 얻지 못한다.
- **THEN** 에이전트는 공식 자료나 CLI로 확인할 수 있는 범위에서 작업을 이어간다.
- **AND** 에이전트는 남은 미확인 범위를 알린다.
