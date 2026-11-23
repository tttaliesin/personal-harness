# Spec Delta

## Purpose

기존 Codex Desktop 입력창에서 프로젝트별 컨트롤러 역할을 확인하고 운영 권한을 기록한다.
작업 저장소, Desktop 프로젝트, 상태 저장소의 범위를 식별해 다른 프로젝트의 대화와 상태를 섞지 않는다.

## ADDED Requirements

### Requirement: Discover local capabilities and use the registered Desktop host

설치본은 로컬 CLI가 지원하는 명령과 기능을 조회할 수 있게 해야 한다(MUST).

#### Scenario: 설치본의 지원 범위 확인

- **WHEN** 컨트롤러가 설치 루트의 CLI에서 `capabilities`를 조회한다.
- **THEN** CLI는 프로젝트 운영, 작업 명세, 평가, 프로젝트 바인딩, 이벤트 전달의 로컬 지원 범위를 반환한다.
- **AND** 컨트롤러는 실제 Desktop 도구의 노출 여부와 동작별 권한을 별도로 확인하고, 허용된 호스트 동작에 기존 Desktop 도구를 사용한다.

### Requirement: Isolate operational state by selected directory and project

상태 명령은 선택한 절대 디렉터리의 `state.sqlite`를 사용하고, 프로젝트별 상태를 `projectId`로 구분해야 한다(MUST).

#### Scenario: 명시 경로 선택

- **WHEN** 호출자가 `--state-dir`를 지정한다.
- **THEN** CLI는 지정한 절대 디렉터리를 상태의 범위로 사용한다.

#### Scenario: 기본 경로 선택

- **WHEN** 호출자가 `--state-dir`를 생략한다.
- **THEN** CLI는 실행 환경의 `LOCALAPPDATA` 아래 `WorkerOrchestrator/state`를 사용한다.
- **AND** `LOCALAPPDATA`가 없으면 사용자 홈의 `.local/share/WorkerOrchestrator/state`를 사용한다.

#### Scenario: 다음 프로세스에서 작업 이어 받기

- **WHEN** 같은 상태 디렉터리에서 후속 CLI 프로세스를 시작한다.
- **THEN** 해당 프로젝트의 역할, 권한, 작업과 실행 상태를 이어서 사용한다.
- **AND** 상태 디렉터리가 달라지면 각 디렉터리의 상태를 독립적으로 관리한다.

#### Scenario: 기존 상태 저장소 열기

- **WHEN** CLI가 지원하는 이전 스키마의 상태 저장소를 연다.
- **THEN** 기존 프로젝트 정체성, 작업, 실행, 확인 중인 동작을 보존한 채 지원하는 상태 형식으로 읽고 이후 명령을 처리한다.

### Requirement: Report status without reserving work

`status`는 프로젝트 및 작업의 저장된 상태와 요청한 동작 기록을 조회할 수 있게 해야 한다(MUST).

#### Scenario: 배정 전 상태 확인

- **WHEN** 호출자가 등록된 `projectId`로 `status`를 실행한다.
- **THEN** CLI는 프로젝트와 작업 목록을 반환한다.
- **AND** 특정 `taskId`와 `actionId`를 지정하면 해당 작업과 저장된 동작을 반환한다.
- **AND** 상태 조회만으로 워커 창을 열거나 실행을 예약하지 않는다.

### Requirement: Resolve an existing controller or worker before initial discovery

`candidate`는 런타임이 제공한 현재 대화 식별자와 확인된 저장소 범위로 등록 상태를 판정해야 한다(MUST).

#### Scenario: 등록된 컨트롤러가 다시 조회

- **WHEN** 호출 대화가 해당 프로젝트의 등록된 컨트롤러다.
- **THEN** CLI는 `controller` 역할과 등록된 프로젝트를 반환한다.
- **AND** `includeStatus: true`면 같은 상태 조회에서 작업 목록도 반환한다.

#### Scenario: 기존 컨트롤러가 있거나 현재 대화가 워커

- **WHEN** 현재 대화가 등록된 워커이거나 해당 프로젝트의 컨트롤러가 다른 대화에 이미 등록돼 있다.
- **THEN** CLI는 각각 워커 역할이나 기존 등록 우선 결과를 반환한다.
- **AND** 기존 컨트롤러의 보관 상태를 이유로 새 컨트롤러를 확정하지 않는다.

### Requirement: Claim the initial controller from complete host evidence

최초 컨트롤러는 검증된 Desktop 기록에서 현재 대화가 해당 프로젝트의 유일한 미보관 후보이고 호출자가 `claim: true`를 지정했을 때만 등록해야 한다(MUST).

#### Scenario: 후보 판단에 필요한 근거가 없는 조회

- **WHEN** 현재 대화의 저장소 범위에 등록이 없고 Desktop 목록 근거도 없다.
- **THEN** CLI는 `DISCOVERY_REQUIRED`를 반환한다.

#### Scenario: 유일한 현재 후보 확인

- **WHEN** 동일 호스트의 프로젝트와 끊김 없는 대화 이력이 유일한 현재 후보를 입증한다.
- **THEN** 조회만 요청하면 CLI는 후보를 반환한다.
- **AND** 같은 근거로 `claim: true`를 요청하면 컨트롤러를 등록하고 생성·전달·보관·복원 권한을 모두 `false`로 기록한다.

#### Scenario: 누락된 기록이나 여러 후보가 있는 경우

- **WHEN** 호스트 근거가 일치하지 않거나, 기록의 페이지가 빠져 있거나, 같은 저장소 범위에 여러 미보관 대화가 있다.
- **THEN** CLI는 새 컨트롤러를 확정하지 않는다.
- **AND** 연결된 Git 워크트리와 해당 범위의 미보관 `notLoaded` 대화도 후보 판정에 반영한다.

#### Scenario: 최초 등록 요청이 동시에 들어온 경우

- **WHEN** 같은 저장소 범위에 최초 등록 요청이 겹친다.
- **THEN** CLI는 승인된 최초 등록을 보존하고 같은 범위에 추가 컨트롤러를 등록하지 않는다.

### Requirement: Scope operating authority to the verified controller and allowed actions

프로젝트 운영 권한은 사용자 위임의 출처와 허용 동작별 값으로 기록하고, 프로젝트 범위의 변경과 구조화 작업은 등록된 컨트롤러의 호출로 확인해야 한다(MUST).

#### Scenario: 운영 위임 설정과 회수

- **WHEN** 등록 컨트롤러가 `project`로 생성·후속 전달·보관·복원 권한과 그 출처를 기록한다.
- **THEN** CLI는 동작별 명시적 불리언을 적용하고 기존 프로젝트 및 자동 등록된 컨트롤러의 정체성을 보존한다.
- **AND** 호출자가 기존 프로젝트 범위 위임을 갱신할 때는 같은 컨트롤러임을 확인한다.
- **AND** 위임을 철회하면 프로젝트 범위와 권한을 새로운 값으로 교체한다.

#### Scenario: 요청 본문에 컨트롤러 식별자를 넣은 호출

- **WHEN** 등록 컨트롤러와 일치하지 않는 런타임 대화가 프로젝트 범위 변경이나 구조화 작업을 실행하려 한다.
- **THEN** CLI는 런타임 호출자에 대한 검사를 적용하고, 요청 본문의 주장만으로 실행 권한을 부여하지 않는다.

### Requirement: Keep the working repository separate from the Desktop project binding

컨트롤러는 Git 작업 범위와 호스트가 확인한 Desktop 프로젝트 ID를 각각 관리해야 한다(MUST).

#### Scenario: 같은 저장소의 연결된 워크트리

- **WHEN** 현재 작업 경로가 이미 등록된 저장소의 연결된 Git 워크트리다.
- **THEN** CLI는 같은 저장소의 등록을 조회할 수 있다.
- **AND** 같은 Desktop 부모 프로젝트에 들어 있는 별도 저장소는 작업 경로로 구분한다.

#### Scenario: Desktop 프로젝트 연결 변경

- **WHEN** 등록 컨트롤러가 현재 호스트의 프로젝트 목록과 대화 기록으로 변경된 소속을 확인하고 `sync-project`를 호출한다.
- **THEN** CLI는 작업 루트, 컨트롤러, 권한을 보존하면서 Desktop 프로젝트 연결을 갱신한다.
- **AND** 생성 응답이 미확정인 동작이 있으면 그 동작을 정리할 때까지 연결을 갱신하지 않는다.
- **AND** 이전 Desktop 그룹에 속한 워커를 새 그룹에 속한다고 기록하지 않는다.
