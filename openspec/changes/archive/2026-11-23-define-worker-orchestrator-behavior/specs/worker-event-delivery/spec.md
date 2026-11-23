# Spec Delta

## Purpose

컨트롤러가 Desktop 대화에서 승인과 종료 결과를 관찰해 현재 워커 실행에 연결한다.
수동 관찰과 프로젝트별 푸시에서 확인한 근거를 보존하고, 전달 지연이나 중복으로 같은 결과가 다시 적용되는 일을 막는다.

## ADDED Requirements

### Requirement: Observe worker results through the registered Desktop host

컨트롤러는 허용된 Desktop 조회와 `observe`로 현재 실행의 진행, 대기와 종료 결과를 관찰할 수 있어야 한다(MUST).

#### Scenario: 수동 관찰과 원문 복구

- **WHEN** 컨트롤러가 현재 실행에 해당하는 관찰 입력이나 공식 `wait_threads` 응답을 `observe`에 전달한다.
- **THEN** CLI는 관찰을 현재 워커와 실행에 연결한다.
- **AND** 요약 조회의 실패, 호스트 불일치 또는 해석할 수 없는 결과를 복구할 때는 등록 호스트의 `read_thread` 원문과 그 근거를 대조한다.
- **AND** 워커, 실행, 턴 또는 메시지의 근거가 서로 맞지 않으면 확인된 대기 상태나 미확인 상태를 유지한다.

#### Scenario: 대기 중이거나 끝나지 않은 워커

- **WHEN** 호스트가 워커 대기를 보고하거나, 현재 실행의 유효한 최종 결과가 아직 없다.
- **THEN** CLI는 그 상태를 보존한다.
- **AND** 단순히 대화가 유휴 상태이거나 이전 턴이 종료됐다는 이유로 현재 실행을 성공으로 표시하지 않는다.

#### Scenario: 같은 관찰의 재전달

- **WHEN** 컨트롤러가 같은 실행과 사건 ID에 대해 이미 기록한 관찰을 다시 전달한다.
- **THEN** CLI는 현재 상태와 기록을 유지한다.
- **AND** 같은 실행에서 재전달한 관찰의 내용이 달라도 최초 기록을 덮어쓰지 않는다.
- **AND** 같은 작업의 다른 실행에 이미 속한 사건 ID를 사용하면 거절한다.

### Requirement: Enable event delivery only within an authorized project and run

컨트롤러는 등록된 프로젝트와 호스트에서 이벤트 전달을 직접 위임받았을 때만 푸시 경로를 사용해야 한다(MUST).

#### Scenario: 프로젝트별 푸시 위임 확인

- **WHEN** 등록된 컨트롤러의 프로젝트 권한에 `scope: "project"`와 `pushEvents: true`가 있다.
- **THEN** 해당 프로젝트의 이벤트 명령과 호스트 연결이 일치하는 워커 실행에 푸시 정보를 사용할 수 있다.
- **AND** `pushEvents`가 생략되거나 회수되면 요청에 푸시 값을 추가해도 새 실행에 푸시 권한이 생기지 않는다.
- **AND** 푸시 위임 여부와 관계없이 권한을 가진 호출자는 수동 관찰 경로를 사용할 수 있다.

### Requirement: Configure only the managed permission hook and retain Desktop trust

`push-config`는 프로젝트에서 관리하는 승인 훅만 적용하거나 제거하고, 별도 훅과 Desktop 신뢰 설정을 보존해야 한다(MUST).

#### Scenario: 적용 전 미리 보기와 기존 훅 보존

- **WHEN** 로컬에 등록된 컨트롤러가 `push-config`를 호출한다.
- **THEN** `apply: true`가 없으면 계획한 설정을 반환한다.
- **AND** 적용을 요청하면 프로젝트 `.codex/hooks.json`의 관리 대상 `PermissionRequest` 그룹만 추가하거나 교체하고 다른 훅을 보존한다.
- **AND** Desktop에서 훅을 실행하도록 허용하는 절차는 사용자의 Hooks UI 확인을 따른다.

#### Scenario: 관리한 훅 제거

- **WHEN** 등록된 컨트롤러가 관리 훅 제거를 요청한다.
- **THEN** CLI는 현재 명령 경로나 제공한 이전 명령 경로가 정확히 일치하는 그룹만 제거할 수 있다.
- **AND** 푸시 위임을 회수한 뒤에도 등록된 컨트롤러는 그 훅을 제거할 수 있다.

### Requirement: Publish approval metadata and terminal results to a project journal

푸시 발행자는 프로젝트와 워커 실행을 대조할 수 있는 사건을 프로젝트별 저널에 먼저 기록해야 한다(MUST).

#### Scenario: 승인 요청 기록과 통지

- **WHEN** `journal-approval`가 실제 프로젝트 안의 작업 디렉터리, 워커 대화와 턴 식별자가 담긴 승인 훅 입력을 받는다.
- **THEN** CLI는 대조에 필요한 승인 메타데이터를 프로젝트 루트의 `.local/worker-orchestrator/push/` 아래 프로젝트별 `inbox.sqlite`에 기록한다.
- **AND** 승인 원문과 사용자의 승인 결정은 해당 워커 대화에서 다룬다.
- **AND** 별도의 Desktop 훅은 사건 식별자를 컨트롤러에게 알린다.

#### Scenario: 워커의 종료 결과 기록과 재발행

- **WHEN** 워커가 현재 `runId`의 유효한 `completed` 또는 `failed` 결과를 `push-result`에 제출한다.
- **THEN** CLI는 런타임의 워커 대화 ID와 같은 호스트에서 전달받은 컨트롤러 대상을 검사하고 결과를 저널에 저장한다.
- **AND** 워커는 배정한 컨트롤러로 향하는 반환된 알림 계획을 사용하고, 저널에 보낸 것과 같은 결과 JSON으로 턴을 끝낸다.
- **AND** 같은 결과를 재발행하면 같은 사건 ID를 반환한다. 같은 실행에서 결과나 턴이 달라진 재발행은 충돌로 처리한다.

### Requirement: Correlate notices with host identity and preserve pending events

`push-inbox`는 호스트가 제공한 출처와 프로젝트 저널을 대조하고 등록된 워커의 현재 실행에 해당하는 사건을 찾아야 한다(MUST).

#### Scenario: 네이티브 알림으로 받은 사건 확인

- **WHEN** 컨트롤러가 실제 Desktop 콜백을 받는다.
- **THEN** 컨트롤러는 네이티브 봉투의 실제 `source_thread_id`와 marker의 워커 ID, 프로젝트와 호스트를 대조한다.
- **AND** 잘못되거나 지연된 알림이 있어도 현재 프로젝트의 다른 처리 가능한 사건을 조회할 수 있다.

#### Scenario: 등록보다 빨리 도착하거나 새 실행보다 오래된 사건

- **WHEN** 사건이 워커 연결 기록보다 먼저 오거나, 현재 `runId`에 해당하지 않는다.
- **THEN** CLI는 그 사건을 현재 실행의 완료 근거로 적용하지 않는다.
- **AND** 워커가 연결된 뒤에는 보류한 사건을 다시 대조할 수 있다.
- **AND** 승인 알림이 저널 기록보다 먼저 왔으면 제한된 재확인을 거친다. 알림이 유실돼도 이후 컨트롤러 턴의 `push-inbox`에서 미처리 사건을 찾을 수 있다.

### Requirement: Verify current worker evidence before applying a push event

`push-observe`는 사건과 동일한 워커·호스트·현재 실행·턴의 확인된 원문을 사용해야 한다(MUST).

#### Scenario: 종료 결과가 확인된 경우

- **WHEN** 컨트롤러가 등록 워커의 현재 턴 원문을 읽고, 유효한 최종 보고가 저널의 결과와 일치함을 확인한다.
- **THEN** CLI는 종료 결과를 관찰에 연결하고 컨트롤러가 평가할 수 있게 한다.
- **AND** 조회 실패, 턴 불일치, 종료 전 상태 또는 결과 불일치는 보류한다.

#### Scenario: 승인 플래그가 확인된 경우

- **WHEN** 사건에 해당하는 활성 워커 턴에서 실제 승인 대기 플래그를 확인한다.
- **THEN** CLI는 사건 ID로 승인 대기를 기록하며 같은 사건을 다시 관찰해도 대기를 중복 추가하지 않는다.
- **AND** 이미 종료된 턴의 승인 사건은 새 대기를 만들지 않는다.

### Requirement: Acknowledge only selected handled events in controller workflow

컨트롤러는 처리했거나 이미 정리된 사건의 ID만 `push-ack`에 전달하고 보류한 사건은 다음 조회에 남겨야 한다(MUST).

#### Scenario: 일부 사건만 처리한 경우

- **WHEN** 컨트롤러가 결과 평가 또는 승인 표시를 마친 사건을 선택한다.
- **THEN** CLI는 요청된 ID 중 해당 프로젝트에서 호환되는 미처리 사건을 확인 처리한다.
- **AND** 요청에 포함하지 않았거나 다른 프로젝트의 사건은 그대로 남는다.
- **AND** 같은 확인을 반복해도 처리 상태나 평가를 중복 적용하지 않는다.

#### Scenario: 배정 이후 컨트롤러 턴 종료

- **WHEN** 푸시를 사용하는 컨트롤러가 배정 기록과 현재 처리 가능한 사건을 마친다.
- **THEN** 컨트롤러는 워커 종료를 기다리는 호출을 추가하지 않고 현재 턴을 끝낸다.
- **AND** 호스트 콜백을 받은 턴이나 이후 컨트롤러 턴에서 미처리 사건을 이어서 처리한다.
