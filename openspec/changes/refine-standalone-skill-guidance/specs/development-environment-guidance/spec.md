# Spec Delta

## MODIFIED Requirements

### Requirement: Preserve the repository contract

환경 구성은 별도 변경을 요청받은 경우를 제외하고 대상 저장소의 프레임워크, 런타임, 의존성 버전, 아키텍처, 명령 실행기, 배포 경로와 repo-governance 규칙을 유지해야 한다(MUST).

#### Scenario: Repository run or test entry point

- **WHEN** 저장소의 실행 또는 테스트 환경을 마련한다.
- **THEN** 저장소 지침과 해당 시나리오의 기존 명령이나 설정부터 확인한다.
- **AND** 시나리오의 실행을 결정하는 런타임, 의존성, 테스트 설정을 확인한다.
- **AND** 실제 대상 런타임과 운영체제에서 애플리케이션 코드와 기존 명령을 사용한다.
- **AND** 요청한 시나리오에 빠진 부분만 보완한다.

#### Scenario: Native Windows service with external dependencies

- **GIVEN** 서비스 동작이 Windows 호스트를 요구한다.
- **WHEN** 기존 Windows 서비스와 외부 의존성의 로컬 통합 테스트를 마련한다.
- **THEN** 대상 프레임워크에 맞는 호환 도구로 애플리케이션을 Windows에서 실행한다.
- **AND** 컨테이너가 필요한 경우 호환되는 의존성에 사용한다.
- **AND** 서비스 등록, 권한, 시작과 종료 등 서비스 수명 주기는 해당 동작을 수행한 Windows 실행 결과로 확인한다.

### Requirement: Verify the relevant environment boundary

환경 검증은 실제 의존성과 시뮬레이터가 대신한 범위를 식별해야 한다(MUST).
요청한 시작, 테스트, 정리 절차를 검증하고 수행한 명령과 결과를 보고해야 한다(MUST).

#### Scenario: Dependency simulator is useful

- **WHEN** 실제 외부 의존성에 접근할 수 없거나 확정적인 장애 재현이 필요하다.
- **THEN** 요청한 외부 동작만 재현하는 결정적 시뮬레이터를 사용하거나 재사용할 수 있다.
- **AND** 보고서에 시뮬레이터가 대신한 범위와 실제로 확인한 동작을 기록한다.

#### Scenario: Integration test dependency readiness

- **GIVEN** 테스트 실행기가 의존성을 관리한다.
- **WHEN** 해당 통합 테스트를 실행한다.
- **THEN** 실행기의 기존 시작·준비 확인을 사용한다.
- **AND** 동시에 또는 반복해서 실행할 때 충돌할 수 있는 데이터, 포트와 리소스 이름을 격리한다.

#### Scenario: Integration test expects a running dependency

- **GIVEN** 통합 테스트는 의존성이 이미 실행 중이라고 가정한다.
- **WHEN** 해당 통합 테스트를 실행한다.
- **THEN** 테스트를 호출하기 전에 의존성이 요청을 처리할 준비가 됐는지 확인한다.
- **AND** 동시에 또는 반복해서 실행할 때 충돌할 수 있는 데이터, 포트와 리소스 이름을 격리한다.

#### Scenario: Test state needs cleanup

- **WHEN** 검증 후 테스트 상태를 초기화하거나 정리한다.
- **THEN** 대상이 폐기 가능하며 요청 범위에 드는지 먼저 확인한다.
- **AND** Compose 상태를 초기화할 때는 대상 프로젝트의 폐기 가능한 볼륨과 공유 또는 외부 볼륨을 식별한다.
- **AND** 관련 없는 컨테이너, 볼륨, 서비스와 사용자 데이터는 보존한다.

#### Scenario: Verification is reported

- **WHEN** 사용자가 환경 검증 결과를 받는다.
- **THEN** 보고서에 구성 제안, 설정 구문 확인, 실행한 테스트와 배포 검증 중 어디까지 수행했는지 기록한다.
- **AND** 확인할 수 없었던 항목과 요청 범위에 포함된 장애 또는 복구 검사의 결과를 기록한다.
