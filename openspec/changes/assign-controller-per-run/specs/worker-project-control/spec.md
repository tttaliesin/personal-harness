# 워커 프로젝트 제어 변경

## MODIFIED Requirements

### Requirement: Report status without reserving work

`status`는 검증된 호출자에게 프로젝트 상태와 그 호출자가 소유한 작업 및 현재 실행의 동작 기록만 반환해야 한다(MUST).

#### Scenario: 배정 전 상태 확인

- **WHEN** 등록된 채팅이 런타임의 채팅 ID와 호스트로 `status`를 호출한다.
- **THEN** CLI는 해당 프로젝트와 호출자가 현재 실행을 소유한 작업 목록을 반환한다.
- **AND** 특정 `taskId`와 `actionId`를 지정하면 같은 소유자 범위에서 해당 작업과 저장된 동작을 반환한다.
- **AND** 상태 조회만으로 워커 채팅을 열거나 실행을 예약하지 않는다.

#### Scenario: 같은 프로젝트의 다른 컨트롤러 상태 조회

- **GIVEN** 같은 Desktop 프로젝트에서 등록된 채팅 A와 B가 각자 작업을 배정했다.
- **WHEN** B가 `status`로 목록을 조회하거나 A의 작업 또는 동작을 직접 지정한다.
- **THEN** 목록에는 B가 소유한 작업만 포함한다.
- **AND** A의 작업이나 동작을 직접 지정한 요청은 해당 기록을 공개하지 않고 거절한다.

### Requirement: Resolve an existing controller or worker before initial discovery

`candidate`는 실제 런타임의 현재 채팅 ID와 호스트를 확인된 작업 범위의 등록 정보에 대조해야 한다(MUST).

#### Scenario: 등록된 컨트롤러가 다시 조회

- **WHEN** 호출 채팅과 호스트가 해당 프로젝트의 등록 정보와 일치한다.
- **THEN** CLI는 `controller` 역할과 등록된 프로젝트를 반환한다.
- **AND** `includeStatus: true`면 호출자가 소유한 작업 목록을 함께 반환한다.

#### Scenario: 기존 컨트롤러가 있거나 현재 대화가 워커

- **WHEN** 현재 채팅과 호스트가 등록 워커의 식별 정보와 일치한다.
- **THEN** CLI는 워커 역할을 반환한다.
- **AND** CLI는 이 호출로 해당 채팅을 컨트롤러로 등록하지 않는다.

#### Scenario: 다른 채팅이 먼저 등록된 프로젝트

- **WHEN** 현재 채팅은 미등록 상태이고 같은 프로젝트에 다른 컨트롤러가 이미 등록돼 있다.
- **THEN** CLI는 현재 채팅의 Desktop 소속을 확인하는 절차를 적용한다.
- **AND** 기존 컨트롤러의 채팅 상태와 관계없이 현재 채팅의 소속 근거로 등록 여부를 판정한다.

### Requirement: Scope operating authority to the verified controller and allowed actions

CLI는 같은 프로젝트 안에서도 운영 위임을 채팅 ID와 호스트별로 기록해야 한다(MUST).
CLI는 사용자 위임의 출처와 동작별 권한을 보존해야 한다(MUST).
CLI는 사용자가 허가한 일회성 워커 보관을 해당 실행과 배정한 채팅에 묶어야 한다(MUST).

#### Scenario: 운영 위임 설정과 회수

- **WHEN** 등록된 채팅이 `project`로 사용자가 명시한 위임을 기록하거나 회수한다.
- **THEN** CLI는 현재 호출 채팅의 생성·후속 전달·보관·복원·푸시 권한에 명시적 불리언을 적용한다.
- **AND** 프로젝트 정체성과 다른 채팅의 위임은 유지한다.

#### Scenario: 등록과 사용자 위임의 구분

- **WHEN** CLI가 검증을 통과한 채팅을 새로 등록한다.
- **THEN** 해당 채팅의 모든 운영 권한은 `false`다.
- **AND** 기존 프로젝트 컨트롤러에게 주어진 사용자 위임은 그 채팅에만 적용한다.
- **AND** 새로 등록한 채팅은 사용자 위임이 허용한 동작만 실행할 수 있다.

#### Scenario: 사용자가 이번 실행의 워커만 보관하도록 허가

- **WHEN** 등록된 컨트롤러가 원래 사용자 요청의 보관 허가 출처를 배정에 포함한다.
- **THEN** CLI는 허가를 현재 `runId`와 배정한 채팅에 기록한다.
- **AND** 허가의 적용 대상은 이 실행의 워커 보관으로 한정한다.
- **AND** 후속 배정과 재시도는 각 실행의 허가를 적용한다.
- **AND** 종료 결과 전송과 워커 보관의 허가를 각각 확인한다.

#### Scenario: 요청 본문에 컨트롤러 식별자를 넣은 호출

- **WHEN** 호출자가 요청 본문에 등록된 다른 채팅의 ID나 호스트를 넣어 위임을 변경하거나 작업을 실행하려 한다.
- **THEN** CLI는 실제 런타임의 채팅 ID와 호스트로 호출자의 등록과 권한을 확인한다.
- **AND** CLI는 요청 본문의 식별자로 다른 채팅의 권한을 사용하지 않는다.

## ADDED Requirements

### Requirement: Enroll the current non-worker chat from verified Desktop project evidence

`candidate`는 공식 Desktop 프로젝트 목록과 첫 페이지부터 연속된 채팅 이력에서 현재 채팅의 소속을 확인해야 한다(MUST).
검증을 통과한 미등록 일반 채팅은 자동 등록해야 한다(MUST).

#### Scenario: 현재 채팅을 찾은 연속 이력

- **GIVEN** 현재 채팅은 미보관 상태이며 등록된 워커가 아니다.
- **WHEN** 실제 런타임의 채팅 ID와 호스트가 공식 이력에 있고, 공식 프로젝트 목록과 작업 경로가 같은 소속을 입증한다.
- **THEN** CLI는 해당 프로젝트에 현재 채팅을 자동 등록하고 `controller`를 반환한다.
- **AND** 프로젝트 정체성이 아직 없으면 CLI는 확인된 작업 범위와 Desktop 소속으로 정체성을 함께 기록한다.
- **AND** 현재 채팅을 포함한 페이지까지 연결된 이력이 있으면 이후 페이지와 다른 일반 채팅의 수에 관계없이 등록할 수 있다.
- **AND** `claim`을 생략한 호출에서도 등록한다.

#### Scenario: 현재 채팅의 소속을 입증할 수 없는 이력

- **WHEN** 현재 채팅이 공식 이력에 없거나 페이지 연결이 끊겨 있다.
- **THEN** CLI는 근거 부족을 보고하고 프로젝트 정체성과 채팅 등록을 추가하지 않는다.
- **AND** 현재 채팅의 호스트, Desktop 프로젝트 또는 작업 범위가 근거와 일치하지 않아도 등록하지 않는다.
- **AND** 미등록 채팅의 공식 근거를 아직 받지 못했으면 `DISCOVERY_REQUIRED`를 반환한다.

#### Scenario: 서로 다른 채팅의 최초 등록이 동시에 요청된 경우

- **WHEN** 같은 작업 범위와 Desktop 소속을 입증한 두 일반 채팅이 최초 등록을 동시에 요청한다.
- **THEN** CLI는 하나의 프로젝트 정체성을 기록하고 두 채팅을 그 프로젝트에 독립적으로 등록한다.
- **AND** 같은 채팅의 등록을 반복해도 기록을 중복하거나 이미 기록한 사용자 위임을 초기화하지 않는다.

## REMOVED Requirements

### Requirement: Claim the initial controller from complete host evidence

**Reason** — 프로젝트에 여러 일반 채팅이 등록될 수 있다. 각 실행의 소유자는 그 실행을 배정한 채팅이다.

**Migration** — `candidate`에 실제 현재 채팅을 포함하는 연속 이력과 공식 프로젝트 목록을 제공한다. 기존 프로젝트 컨트롤러의 등록과 이전 실행의 소유권을 보존한다.
