# 워커 결과 평가

## Purpose

사용자가 원하는 결과를 관찰 가능한 완료 기준으로 표현하고, 워커의 현재 실행 결과를 그 기준에 대조한다.
검증 근거와 운영 상태를 함께 확인해 결과 채택, 재시도, 사용자 결정 대기와 차단을 구분한다.

Worker Orchestrator 공개 배포본 `0.1.6`의 구조화 작업과 검증 절차를 기준으로 삼는다. [배포 사용법](../../../packages/worker-orchestrator/release/docs/usage.md#구조화된-작업-평가)

## Requirements

### Requirement: Carry verifiable completion criteria in structured work

구조화 작업의 `workSpec`에는 목표, 제약 목록, 고유한 ID를 가진 하나 이상의 완료 기준이 있어야 한다(MUST).

#### Scenario: 새 구조화 작업 배정

- **WHEN** 등록된 컨트롤러가 구조화 작업의 배정을 요청한다.
- **THEN** CLI는 작업 명세를 검사하고 워커에게 전달할 지시에 완료 기준과 제약을 보존한다.
- **AND** 같은 기준 ID를 반복하거나 기준 설명을 비워 두면 실행 계획을 확정하지 않는다.

#### Scenario: 추론 강도 후보 설정

- **WHEN** 컨트롤러가 초기 프로필과 `reasoningEscalations`를 지정한다.
- **THEN** 상승 후보는 지원하는 강도의 순서에서 초기 요청보다 높고 서로 증가해야 한다.
- **AND** 호스트의 실제 적용 프로필은 확인한 호스트 근거로만 보고한다.

### Requirement: Report worker results for the assigned run and scope

워커는 배정 범위 안에서 작업하고, 현재 `runId`에 연결된 구조화된 결과로 자신의 검증과 대기 요청을 보고해야 한다(MUST).

#### Scenario: 현재 실행을 마친 워커

- **WHEN** 워커가 배정받은 작업의 결과를 보고한다.
- **THEN** 최종 응답은 `runId`, `status`, `summary`, `verification`, `pendingRequests`를 포함하는 JSON 객체다.
- **AND** 완료 기준이 있으면 요약에 각 기준의 결과나 미충족 이유를 포함한다.
- **AND** 검증을 실행하지 않았으면 `not_run`으로 기록하고, 실제로 확인한 근거만 참조에 넣는다.

#### Scenario: 권한이나 사용자 입력이 필요한 워커

- **WHEN** 배정 범위나 권한 때문에 작업이 멈춘다.
- **THEN** 워커는 대기 요청을 현재 실행 결과에 보존한다.
- **AND** 프로젝트 위임의 변경, 다른 워커 대화의 운영, 결과 채택은 컨트롤러 측 절차로 남긴다.

### Requirement: Evaluate each criterion using the controller's review of the current result

`evaluate`는 현재 실행의 결과 이벤트와 일치하고 원래의 모든 기준을 한 번씩 포함한 컨트롤러 판정을 사용해야 한다(MUST).

#### Scenario: 완료 기준 검증과 근거 제출

- **WHEN** 컨트롤러가 테스트 출력이나 파일을 직접 대조한 뒤 `evaluate`를 호출한다.
- **THEN** 각 기준의 `met`, `unmet` 또는 `uncertain` 판정과 이유, 근거 참조를 현재 `resultEventId`에 연결한다.
- **AND** 고정 제약이 있으면 `constraintReview`로 확인 결과를 함께 보낸다.
- **AND** CLI는 각 기준을 `met`으로 표시하고 근거 참조를 하나 이상 제시한 경우에만 그 기준을 충족한 것으로 처리한다.
- **AND** 참조가 가리키는 사실은 컨트롤러가 확인한다.

#### Scenario: 워커 자체 검증과 컨트롤러 검증 구분

- **WHEN** 워커가 검증 통과를 보고한다.
- **THEN** CLI는 워커의 보고를 진단 근거로 별도 보존한다.
- **AND** 컨트롤러는 자신이 직접 확인한 근거를 제출한다.
- **AND** 실제로 대조했다면 워커가 언급한 것과 같은 출처도 사용할 수 있다.

#### Scenario: 결과와 평가가 다른 실행을 가리키는 경우

- **WHEN** 현재 실행의 새 평가에 다른 결과 이벤트 ID를 제출하거나 기존 기준을 누락·중복한다.
- **THEN** CLI는 그 평가를 거절하고 기존 결과를 그대로 유지한다.

### Requirement: Accept completion only with current success and supported review

현재 실행의 결과가 성공했고 모든 기준과 제약이 확인됐으며 해결할 대기와 호스트 상태가 없을 때만 `complete`를 확정해야 한다(MUST).

#### Scenario: 모든 완료 조건을 충족한 경우

- **WHEN** 현재 워커의 종료 결과가 성공을 보고하고 컨트롤러가 근거로 기준과 제약의 충족을 확인한다.
- **THEN** CLI는 `complete` 결정, 통과한 검증, 결과 채택을 함께 기록한다.
- **AND** 사용자는 컨트롤러에게서 확인된 결과와 근거를 받는다.

#### Scenario: 사용자 결정이 필요한 경우

- **WHEN** 컨트롤러가 범위, 권한 또는 사용자 입력에 관해 실제로 결정할 질문을 제출한다.
- **THEN** CLI는 그 질문을 `needs_user` 결정에 보존한다.

#### Scenario: 평가의 전제 조건이 부족한 경우

- **WHEN** 사용자 결정 질문이 없고, 종료 결과·대기 해제·호스트 확인·충족 판정의 근거·제약 확인 중 필요한 항목이 빠져 있다.
- **THEN** CLI는 해당 차단 원인을 `blocked`로 기록한다.

### Requirement: Retry only with a permitted higher effort on the same worker

새 실행으로 평가를 재시도할 때는 확인된 같은 워커, 권한이 있는 후속 전달, 기존보다 높은 단계의 제공된 추론 강도 후보를 사용해야 한다(MUST).

#### Scenario: 결과 실패 또는 미충족 기준으로 재시도

- **WHEN** 현재 종료 결과가 실패했거나 기준이 미충족·미확인 상태이고 재시도의 전제 조건이 충족된다.
- **THEN** CLI는 같은 모델의 다음 허용 강도로 `retry`를 반환하고 새 `runId`의 전달을 계획한다.
- **AND** 원래 작업 명세와 이전 판단 근거를 후속 실행의 맥락으로 전달한다.
- **AND** 새 결과의 완료 여부는 새 실행의 결과와 검증으로 다시 판단한다.

#### Scenario: 재시도 조건 부족

- **WHEN** 후속 전달 권한이 없거나, 워커 연결이 맞지 않거나, 사용할 상승 후보가 없다.
- **THEN** CLI는 해당 원인의 `blocked` 결정을 반환한다.

### Requirement: Replay a decided evaluation without duplicating its effects

완료 결정이나 이미 발행한 재시도 결정을 다시 조회할 때는 같은 입력과 결과 이벤트를 대조해 기존 결정을 보존해야 한다(MUST).

#### Scenario: 완료 또는 재시도 결정 재전달

- **WHEN** 호출자가 이미 결정된 결과의 평가 입력을 그대로 다시 제출한다.
- **THEN** CLI는 기존 결정을 반환한다.
- **AND** 같은 평가로 새 실행이나 새 보관 동작을 중복 생성하지 않는다.
- **AND** 결과 이벤트가 바뀌거나 같은 결과의 평가 입력이 달라지면 기존 결정을 덮어쓰지 않는다.

#### Scenario: 채택 기록 중 오류

- **WHEN** 구조화 평가의 완료 기록과 함께 수행하는 검증 또는 채택 기록이 실패한다.
- **THEN** 해당 평가의 일부만 완료 상태로 남지 않는다.

### Requirement: Retain the legacy verification path for unstructured work

`workSpec`이 없는 기존 실행은 `verify`와 `accept`로 처리할 수 있어야 하며, 구조화 실행의 완료는 `evaluate`의 확인 절차를 따라야 한다(MUST).

#### Scenario: 기존 성공 결과를 검증하고 채택

- **WHEN** 컨트롤러가 기존 실행의 종료 결과를 확인하고 검증 근거와 함께 `verify`를 호출한다.
- **THEN** 통과 검증에는 근거 참조가 필요하다.
- **AND** 현재 실행에서 종료 결과가 바뀐 경우 검증에는 현재 `resultEventId`가 필요하다.
- **AND** `accept`로 검토한 성공 결과를 채택하려면 현재 검증이 통과했고 승인·입력 대기나 미확정 호스트 동작이 남아 있지 않아야 한다.

#### Scenario: 구조화 실행의 검증 절차를 생략하는 호출

- **WHEN** 호출자가 구조화 결과에 `verify`나 `accept`만 사용해 완료하려 한다.
- **THEN** CLI는 `STRUCTURED_EVALUATION_REQUIRED`를 반환한다.
