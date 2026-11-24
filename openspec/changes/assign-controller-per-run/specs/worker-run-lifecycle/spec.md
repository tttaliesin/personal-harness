# 워커 실행 생명주기 변경

## MODIFIED Requirements

### Requirement: Plan delegated work for an authorized project worker

CLI는 현재 호출 채팅의 운영 위임, 작업에 연결된 워커와 실행 상태를 확인해 `dispatch`의 호스트 동작을 정해야 한다(MUST).
새 실행을 예약할 때 실제 런타임의 채팅 ID와 호스트를 `task.controllerRef`에 저장해야 한다(MUST).

#### Scenario: 독립 작업의 범위를 배정

- **WHEN** 등록된 컨트롤러가 서로 독립적인 작업을 워커에게 배정한다.
- **THEN** 각 작업에 서로 다른 `taskId`를 부여하고 파일 소유 범위가 겹치지 않게 정한다.
- **AND** 각 실행은 배정 계획, Desktop 호출, 실제 응답 기록의 순서를 유지한다.

#### Scenario: 같은 프로젝트의 두 컨트롤러가 각자 배정

- **GIVEN** 같은 Desktop 프로젝트의 등록 채팅 A와 B가 필요한 운영 위임을 각각 받았다.
- **WHEN** 두 채팅이 서로 다른 새 작업을 배정한다.
- **THEN** CLI는 실행별로 `runId`를 발급한다.
- **AND** 두 실행의 `task.controllerRef`에는 각각 배정한 채팅의 런타임 채팅 ID와 호스트가 들어간다.

#### Scenario: 새 워커와 기존 워커 선택

- **WHEN** 새 실행을 시작할 수 있고 해당 작업에 워커가 연결돼 있지 않다.
- **THEN** CLI는 호출자의 생성 권한을 확인한 뒤 현재 Desktop 프로젝트의 워커 생성 계획을 반환한다.
- **AND** `reuseOnly: true`인 경우에는 연결된 워커가 있어야 한다.
- **AND** 연결된 워커가 있으면 후속 전달 권한을 확인하고 동일한 채팅으로 후속 전달을 계획한다.
- **AND** 그 채팅이 보관돼 있으면 복원 권한과 후속 전달 권한을 확인해 복원을 먼저 계획한다.

#### Scenario: 관련 실행이 진행 중이거나 소속이 달라진 경우

- **WHEN** 같은 작업에 활성 실행, 대기, 미확정 호스트 동작 또는 평가하지 않은 구조화 작업이 남아 있다.
- **THEN** CLI는 기존 실행을 유지하고 상태와 남은 조건을 반환한다.
- **AND** `dispatch`는 호출 시점의 권한과 워커 상태를 다시 확인한다.
- **AND** 이전 상태 조회만으로 새 실행이 허용되지 않는다.
- **AND** 워커의 Desktop 프로젝트 연결이 달라지면 이전 워커에 새 요청을 전달하지 않는다.

### Requirement: Archive only a reviewed and accepted worker result

CLI는 현재 실행의 성공, 근거가 있는 검증 통과, 결과 채택, 대기와 미확정 동작 해소 및 보관 권한을 모두 확인한 뒤에만 보관 계획을 반환해야 한다(MUST).
컨트롤러가 `keepWorker: true`를 명시하면 결과를 채택할 때 워커를 유지해야 한다(MUST).

#### Scenario: 후속 작업이 없는 성공 결과

- **GIVEN** 실행을 배정한 채팅에 프로젝트 단위 보관 위임 또는 현재 실행의 보관 허가가 있다.
- **WHEN** 컨트롤러가 `accept` 또는 `evaluate`로 검증한 결과를 채택하고 `keepWorker`를 생략하거나 `false`로 지정한다.
- **THEN** CLI는 해당 실행의 워커에 대한 보관 계획을 반환한다.
- **AND** 보관이 대기 중이면 같은 `action.id`의 계획을 반환한다.
- **AND** 컨트롤러는 실제 Desktop 응답에 대상 워커와 `archived: true`가 일치하는지 확인한 뒤 그 응답을 같은 동작에 기록한다.

#### Scenario: 채택한 실행의 보관을 명시적으로 요청

- **WHEN** 보관 권한이 있는 컨트롤러가 검증하고 채택한 현재 실행에 `archive`를 요청한다.
- **THEN** CLI는 현재 워커의 보관 계획 또는 이미 확인한 보관 상태를 반환한다.

#### Scenario: 채택한 실행의 워커 유지

- **WHEN** 컨트롤러가 `keepWorker: true`를 지정하거나 현재 채택에 적용할 자동 보관 허가가 없다.
- **THEN** CLI는 결과를 채택하고 워커를 유지한다.

#### Scenario: 보관 조건이 충족되지 않거나 워커 유지 요청

- **WHEN** 실행 실패, 검증 근거 누락, 결과 미채택, 미해소 승인·입력 대기 또는 미확정 호스트 동작이 남아 있다.
- **THEN** CLI는 새 보관 계획을 반환하지 않는다.

#### Scenario: 기존에 채택한 실행을 다시 확인하는 경우

- **WHEN** 컨트롤러가 이미 채택한 결과를 다시 평가하거나 채택한다.
- **THEN** CLI는 저장된 결정과 아직 대기 중인 보관 계획을 사용한다.
- **AND** 최초 채택 때 워커를 유지한 실행에는 새 보관 계획을 만들지 않는다.

## ADDED Requirements

### Requirement: Restrict run operations to the controller that assigned the work

CLI는 현재 실행의 소유자를 `task.controllerRef`에서 확인해야 한다(MUST).
저장된 참조가 없는 이전 실행은 원래 프로젝트 컨트롤러에 속해야 한다(MUST).
같은 작업의 소유자는 후속 실행과 재시도에서도 유지해야 한다(MUST).

#### Scenario: 다른 컨트롤러가 기존 작업을 지정

- **GIVEN** 채팅 A가 작업을 소유하며 같은 프로젝트의 채팅 B도 운영 위임을 받았다.
- **WHEN** B가 A의 `taskId`에 `dispatch`를 호출하거나 `record`, `observe`, `resolve`, `verify`, `accept`, `evaluate`, `archive`를 호출한다.
- **THEN** CLI는 실제 런타임의 채팅 ID와 호스트가 소유자와 달라 호출을 거절한다.
- **AND** 요청이 기존 `runId`나 `actionId`를 포함해도 기존 기록과 소유자는 유지된다.

#### Scenario: 소유자 기록이 없는 이전 실행의 후속 배정

- **GIVEN** 이전 실행에 `task.controllerRef`가 없고 원래 프로젝트 컨트롤러는 채팅 A다.
- **WHEN** 권한을 가진 A가 같은 작업을 이어서 배정하거나 평가 결과에 따라 재시도한다.
- **THEN** CLI는 A를 기존 실행의 소유자로 확인한다.
- **AND** 새 실행에는 A의 `task.controllerRef`를 기록한다.
- **AND** 같은 프로젝트에 새로 등록된 채팅 B는 이전 실행을 이어서 배정할 수 없다.

#### Scenario: 첫 배정을 서로 다른 채팅이 동시에 요청

- **WHEN** 채팅 두 개가 같은 프로젝트의 같은 새 `taskId`를 동시에 배정한다.
- **THEN** CLI는 실행의 최초 예약과 소유자 기록을 함께 확정한다.
- **AND** 뒤이어 처리한 호출은 이미 확정한 소유자를 변경할 수 없다.
