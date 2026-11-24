# 워커 실행 생명주기 변경

## ADDED Requirements

### Requirement: Bind an optional Git worktree assignment to a worker task

`dispatch`가 worktree 배정을 받으면 작업 기록에 준비된 로컬 브랜치 이름과 전체 시작 커밋 ID를 보존해야 한다(MUST).
새 워커 생성은 현재 호스트 프로젝트의 해당 브랜치에서 별도 Desktop worktree를 요청해야 한다(MUST).

#### Scenario: 두 쓰기 작업을 별도 worktree로 배정

- **WHEN** 컨트롤러가 서로 다른 브랜치와 시작 커밋을 지정해 같은 저장소의 새 작업 두 개를 배정한다.
- **THEN** 각 생성 요청은 해당 작업의 시작 브랜치를 사용해야 한다.
- **AND** 두 워커는 각각의 worktree에서 배정된 브랜치로 작업한다.

#### Scenario: worktree 지정 없이 배정

- **WHEN** 새 작업 배정이 worktree를 지정하지 않는다.
- **THEN** Desktop은 기존 로컬 실행 방식으로 워커를 생성한다.

#### Scenario: 기존 작업의 배정을 바꾸려 함

- **WHEN** 요청을 재전달하거나 기존 작업을 이어갈 때 기록된 브랜치나 시작 커밋과 다른 값을 보낸다.
- **THEN** CLI는 기존 배정을 유지하고 새 실행이나 호스트 동작을 계획하지 않는다.

#### Scenario: 같은 작업의 재시도

- **WHEN** 연결된 워커의 작업을 이어가거나 평가 결과에 따라 재시도한다.
- **THEN** 기존 워커와 Git 배정을 사용한다.
- **AND** 기존 워커에서 배정된 worktree를 확인할 수 없으면 작업을 멈추고 확인한 상태를 보고한다.

### Requirement: Verify actual worker checkout before editing

워커는 파일을 수정하기 전에 실제 경로가 배정 저장소의 별도 worktree임을 확인해야 한다(MUST).
첫 실행은 전체 시작 커밋을 대조한다.
후속 실행은 배정된 브랜치와 그 브랜치의 이전 작업을 확인한다.

#### Scenario: Desktop이 detached HEAD로 시작

- **WHEN** 실제 worktree와 시작 커밋이 배정과 일치하지만 브랜치가 체크아웃되지 않았다.
- **THEN** 워커는 준비된 작업 브랜치로 전환하고 그 브랜치에서 작업한다.
- **AND** 다른 worktree가 해당 브랜치를 사용 중이면 그 사실을 보고한다.

#### Scenario: 실제 체크아웃이 최초 배정과 다름

- **WHEN** 실제 저장소·worktree·시작 커밋을 확인할 수 없거나 배정과 일치하지 않는다.
- **THEN** 워커는 파일을 수정하기 전에 멈추고 확인한 경로와 Git 상태를 보고한다.

#### Scenario: 작업 결과를 검토

- **WHEN** 컨트롤러가 worktree 워커의 결과를 검토한다.
- **THEN** 컨트롤러는 실제 경로, 브랜치와 커밋을 배정 정보와 대조한다.
- **AND** 컨트롤러는 채팅 보관 결과를 Git 작업의 반영이나 삭제 증거로 쓰지 않는다.

### Requirement: Preserve worktree changes before archiving its worker

CLI는 Desktop worktree를 배정한 워커의 결과를 채택할 때 해당 워커를 유지해야 한다(MUST).
CLI는 명시적 `archive` 요청을 받을 때마다 기존 보관 조건과 함께 실제 Desktop 채팅의 유휴 상태와 작업 경로를 확인해야 한다(MUST).
CLI는 그 경로가 배정 브랜치를 체크아웃한 연결 worktree이고 시작 커밋이 브랜치 이력에 있으며 미커밋 변경이 없는지 확인해야 한다(MUST).
컨트롤러는 Desktop 보관을 호출하기 직전의 채팅 조회와 `archive` 요청에서 반환된 보관 action을 사용해야 한다(MUST).

#### Scenario: worktree 작업을 채택함

- **WHEN** 컨트롤러가 `accept`나 `evaluate`로 결과를 채택하거나 그 요청을 재전달한다.
- **THEN** CLI는 결과를 채택하고 채팅을 유지한다.

#### Scenario: 미커밋 변경이 남은 worktree를 보관하려 함

- **WHEN** 검증·채택한 워커를 보관하려 하지만 배정 브랜치의 worktree에 미커밋 변경이 있거나 그 상태를 확인할 수 없다.
- **THEN** CLI는 Desktop 보관 요청을 내지 않는다.
- **AND** CLI는 기존 결과 채택을 유지한다.

#### Scenario: 이전 보관 계획을 다시 요청함

- **WHEN** 컨트롤러가 이전 보관 계획을 다시 요청하고 해당 워커의 실제 경로가 달라졌거나 미커밋 변경이 생겼다.
- **THEN** CLI는 이전 보관 계획을 실행 가능한 Desktop 요청으로 반환하지 않는다.
- **AND** 보관 조건이 다시 충족되면 같은 계획을 재사용할 수 있다.

#### Scenario: Git에 결과를 남긴 워커를 보관함

- **WHEN** 보관 권한이 있는 컨트롤러가 작업을 보관하려 하고 배정 브랜치와 커밋을 확인했다.
- **THEN** 미커밋 변경이 없는 전용 worktree라면 CLI는 기존 보관 동작을 계획할 수 있다.
- **AND** CLI는 Git 브랜치를 삭제하지 않는다.
