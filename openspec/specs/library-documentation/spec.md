# Library documentation

## Purpose

라이브러리와 플랫폼의 공식 자료를 실제 대상 버전에 맞춰 조회한다.
문서 도구에서 자료를 얻기 어려울 때는 확인할 수 있는 근거로 작업을 이어간다.
공식 도구의 출처는 매니페스트에서 확인한다. [external-resources.toml](../../../external-resources.toml)

## Requirements

### Requirement: Autonomous selective documentation lookup

에이전트는 라이브러리나 프레임워크의 API, 설정, 버전별 동작 또는 예제를 확인해야 할 때 공식 Context7을 자율적으로 선택해야 한다(MUST).
에이전트는 의존성 선언과 lock 파일 등 프로젝트에서 확인할 수 있는 근거로 실제 적용 버전을 파악해야 한다(MUST).
조회할 때는 해당 버전에 맞는 공식 자료를 우선해야 한다(MUST).
외부 문서 평가나 피드백 전송은 별도 사용자 요청이 있을 때만 수행해야 한다(MUST).

#### Scenario: Version-specific API uncertainty

- **GIVEN** 프로젝트의 lock 파일에서 라이브러리 버전을 확인할 수 있다.
- **WHEN** 해당 라이브러리의 버전별 API 동작을 확인해야 한다.
- **THEN** 에이전트는 실제 적용 버전을 확인한 뒤 Context7에서 그 버전의 공식 자료를 찾는다.

#### Scenario: Independent local work

- **WHEN** 알려진 파일을 읽거나 정확한 문자열을 검색하면 작은 수정에 필요한 근거를 얻을 수 있다.
- **THEN** 에이전트는 파일 읽기와 검색 결과를 바로 사용한다.

### Requirement: 대상 버전에 맞는 Microsoft Learn 조회

에이전트는 Microsoft .NET, ASP.NET Core, C#, Windows 또는 PowerShell의 공식 API, 설정, 버전별 동작이나 예제가 필요할 때 Microsoft Learn MCP를 자율적으로 선택해야 한다(MUST).
버전에 따라 답이 달라지면 에이전트는 작업에 관련된 대상 프레임워크, 런타임 또는 운영체제 버전을 먼저 확인해야 한다(MUST).
.NET 문서를 조회할 때는 현대 .NET과 .NET Framework를 구분해야 한다(MUST).
실행 중인 서버, 컨테이너 또는 Windows 서비스의 상태는 해당 환경 조회나 로컬 검사로 확인해야 한다(MUST).

#### Scenario: .NET Framework 프로젝트의 API 확인

- **GIVEN** 프로젝트가 .NET Framework를 대상으로 한다.
- **WHEN** Microsoft 공식 문서에서 API 동작을 확인해야 한다.
- **THEN** 에이전트는 대상 프레임워크 버전을 확인한 뒤 Microsoft Learn에서 해당 버전의 자료를 바로 조회한다.

#### Scenario: 공식 자료를 이미 확인한 작업

- **WHEN** 로컬 소스나 이미 조회한 공식 자료로 작업에 필요한 근거가 충분하다.
- **THEN** 에이전트는 확보한 근거로 작업을 이어간다.

#### Scenario: Windows 서비스의 실행 상태 확인

- **WHEN** 작업에 실행 중인 Windows 서비스의 상태가 필요하다.
- **THEN** 에이전트는 대상 환경에서 서비스 상태를 조회한다.

### Requirement: Truthful availability and fallback

에이전트는 확인할 근거에 맞춰 조회 도구를 선택해야 한다(MUST).
조회에 전달하는 내용은 필요한 기술 질문으로 한정해야 한다(MUST).
Context7 또는 Microsoft Learn MCP에서 문서를 얻지 못하거나 대상 버전의 자료가 부족하면 에이전트는 공식 문서, 소스 또는 관련 로컬 검사로 확인을 이어가야 한다(MUST).
에이전트는 실제로 받은 자료를 기준으로 조회 결과를 보고하고 남은 미확인 범위를 밝혀야 한다(MUST).

#### Scenario: Authentication or retrieval is unavailable

- **WHEN** 인증, 사용 한도 또는 연결 문제로 조회가 실패하거나 도구가 대상 버전의 자료를 제공하지 않는다.
- **THEN** 에이전트는 사용할 수 있는 공식 자료나 로컬 근거로 확인을 이어간다.
- **AND** 에이전트는 확인하지 못한 범위를 알린다.
