# Windows 작업 실행기 권장

## Purpose

프로젝트에 선언된 작업 실행기와 CI의 호출 근거를 읽어 기존 작업을 유지하거나 공통 작업을 새로 제안할 조건을 제시한다.
정적으로 판단할 수 없는 부분과 사용자가 직접 확인할 명령도 함께 기록한다.

Windows Agent Devkit 공개 배포본 `0.3.5`의 작업 실행기 진단을 기준으로 삼는다. [배포 실행기 문서](../../../packages/windows-agent-devkit/release/docs/task-runners.md)

## Requirements

### Requirement: Discover task declarations without evaluating them

진단은 mise tasks·Go Task·just·GNU Make·npm scripts의 지원하는 작업 선언을 정적으로 읽어야 한다(MUST).

#### Scenario: 실행기별 작업 이름과 문맥 확인

- **WHEN** 루트, 적용되는 상위 선언 범위 또는 명시적 작업 공간에 실행기 파일이 있다.
- **THEN** `mise.toml`·`.mise.toml`의 작업, `Taskfile.yml`·`Taskfile.yaml`과 지원하는 `.dist` 변형, `Justfile`·`justfile`·`.justfile`, `Makefile`·`makefile`·`GNUmakefile`, `package.json`의 `scripts`를 확인한다.
- **AND** 보고서의 `taskRunners.declarations`에 실행기·출처·상태·작업 이름·미확인 사유를 기록한다.
- **AND** 지원하는 정적 셸 인수, 작업 경로, 환경 키와 의존 작업 이름만 추가 근거로 기록한다.
- **AND** mise의 도구 버전 목록만으로 기존 작업을 확인하지 않는다.

#### Scenario: 외부 포함, 동적 표현과 파일 기반 작업

- **WHEN** Taskfile의 include, Just의 import, Make의 동적 구문 또는 다른 지원하지 않는 표현을 발견한다.
- **THEN** 실행하거나 외부 참조를 따라가지 않고 영향을 받는 선언을 `unknown`으로 기록한다.
- **AND** `mise-tasks`는 폴더 존재를 `unknown` 근거로 남기고 내부 작업 파일을 읽지 않는다.
- **AND** 파서 오류 원문, 명령 본문과 환경 값은 보고서에 복사하지 않는다.

### Requirement: Link eligible CI calls to existing tasks

진단은 GitHub Actions에서 정적으로 찾은 실행기 호출과 기존 작업 선언의 연결 근거를 확인해야 한다(MUST).

#### Scenario: 루트 작업과 CI 호출의 연결

- **WHEN** GitHub Actions의 루트 호스트 단계가 지원하는 실행기의 작업 이름 하나를 정적인 단일 명령으로 실행한다.
- **THEN** 진단은 워크플로 경로, 작업 ID, 단계 위치, 해당 실행기와 호출한 작업 이름을 기록한다.
- **AND** `npm test`와 `npm run test`는 `test` 작업의 호출 근거가 될 수 있다.
- **AND** `npm ci` 같은 의존성 설치와 실행기의 버전 확인은 작업 호출과 다른 종류로 기록한다.
- **AND** 같은 실행기의 루트 선언이 여러 개면 모든 후보에서 그 작업 이름을 확인했을 때만 연결한다.

#### Scenario: 불명확한 작업 호출

- **WHEN** 호출이 컨테이너·다른 작업 경로·지원하지 않는 셸 문맥에 있거나, 동적 인수·복합 명령·확인할 수 없는 작업 이름을 포함한다.
- **THEN** 해당 호출을 확인된 루트 작업으로 사용하지 않는다.
- **AND** 근거에서 명령 본문을 제외한다.

### Requirement: Keep existing tasks or defer when evidence is incomplete

진단은 기존 작업 선언과 관련 CI의 확인 상태를 기준으로 작업 실행기의 유지 또는 판단 보류를 반환해야 한다(MUST).

#### Scenario: 기존 작업 유지

- **WHEN** 현재 프로젝트 범위에 정적으로 확인한 작업 선언이 있고 관련 CI 호출이 모두 해당 루트 선언과 일치하거나 확인할 호출이 없다.
- **THEN** `taskRunners.recommendation.action`은 `keep`이다.
- **AND** 확인한 실행기가 여러 개면 각 실행기를 유지 대상으로 기록한다.
- **AND** 루트 npm scripts와 CI의 연결을 확인하면 호출 작업과 정의 파일을 근거로 표시한다.
- **AND** 관련 CI 호출을 찾지 못했으면 선언으로 유지 근거를 제시하고 CI 일치는 미확인으로 표시한다.

#### Scenario: 선언이나 호출 연결이 불명확한 경우

- **WHEN** 실행기 선언이나 CI 호출의 일부가 `unknown`이거나, CI 위치·작업 이름·루트 정의의 연결을 확인하지 못한다.
- **THEN** `taskRunners.recommendation.action`은 `defer`다.
- **AND** CI에서 실행기를 호출했다는 사실만으로 해당 도구를 채택했다고 판단하지 않는다.
- **AND** 반복 절차가 있더라도 해결되지 않은 기존 작업을 대체하라는 제안을 반환하지 않는다.

### Requirement: Suggest a new task runner from repeated CI workflow evidence

기존 작업을 유지할 근거가 없는 경우, 진단은 재현 가능한 반복 CI 절차와 실행기 선택 근거를 함께 확보했을 때만 `suggest`를 반환해야 한다(MUST).

#### Scenario: 반복 절차의 확인 조건

- **WHEN** 서로 다른 GitHub Actions 호스트 작업이 기본 checkout 뒤에 저장소 루트에서 인식 가능한 빌드·검사 명령을 반복한다.
- **THEN** 적어도 두 개의 연속 `run` 단계가 각각 같은 리터럴 한 줄을 같은 순서와 인수로 선언할 때 반복 절차의 근거로 삼는다.
- **AND** 보고서에는 작업·단계 위치, 언어·작업 종류와 준비 단계를 기록한다.
- **AND** 한쪽의 명령 순서·인수를 바꾸거나 사이에 다른 단계를 삽입해 공통 구간이 사라지면 그 구간은 제안 근거에서 빠진다.

#### Scenario: npm scripts 또는 mise tasks 선택

- **WHEN** 루트 Node.js 패키지의 npm 잠금 파일이나 정확한 npm 버전 선언과 Node.js 전용 반복 절차를 확인한다.
- **THEN** 명시한 다른 실행기 선택이 없고 관리자가 충돌하지 않으면 `npm scripts`를 제안한다.
- **AND** 선언된 두 언어 이상의 반복 절차 또는 루트 mise가 관리하는 선언 언어의 반복 절차에는 `mise tasks`를 제안한다.
- **AND** 서로 다른 절차가 npm과 mise를 각각 근거로 선택하면 `defer`를 반환한다.

#### Scenario: Go Task·just·GNU Make 선택 및 보류 조건

- **WHEN** 프로젝트가 정확한 실행기 버전을 고정했거나 반복 절차의 모든 참여 작업에 같은 실행기의 준비 단계가 앞선다.
- **THEN** 지원하는 명시 선택 조건을 만족하는 Go Task·just·GNU Make 중 하나를 제안한다.
- **AND** GNU Make는 반복 절차에서 앞서 생성한 오브젝트 파일을 뒤따르는 링크의 입력으로 사용한다는 근거가 있어야 제안한다.
- **AND** 링크가 다른 파일을 사용하거나, 버전 고정 없이 일부 작업만 실행기를 준비하거나, 선택이 충돌하면 판단을 보류한다.
- **AND** 반복 절차나 선택 근거 없이 신규 기본 권장안만으로 `suggest`를 반환하지 않는다.

### Requirement: Report executable metadata and guide manual verification

진단은 작업 실행기의 정적 판정과 실행 파일 관찰을 기존 점검 ID에 연결하고 확인 명령을 안내해야 한다(MUST).

#### Scenario: 작업 실행기 버전과 기존 점검 계약

- **WHEN** 선언 또는 CI에서 mise·Task·just·Make를 찾는다.
- **THEN** 진단은 검증된 실행 파일에 허용한 `--version` 조회만 수행한다.
- **AND** 명령 후보·버전·결과를 `taskRunners.tools`에 표시하고, 알 수 없는 버전 출력과 누락된 실행 파일을 구분한다.
- **AND** 셸 기본값과 인수, 프로젝트 작업 경로, 실행 경로, 요구, 권장 근거를 각각 `SH-01`, `ENV-02`, `PATH-01`, `REQ-01`, `RCM-01`에 연결한다.
- **AND** 선언한 실행기가 현재 PATH에서 없어도 선언만으로 필수 실행 실패를 만들지 않으며, 점검 ID 수는 30개다.
- **AND** 작업 실행, 목록 조회, dry run을 자동 실행하지 않는다.

#### Scenario: 사용자가 실행할 기존 작업 안내

- **WHEN** 루트 선언과 CI에서 `build`, `check`, `lint`, `test`, `verify` 또는 지원하는 접미사가 붙은 해당 작업의 연결을 확인한다.
- **THEN** 중복을 제거해 `commandGuidance`에 실행기와 작업 이름을 인수로 제공한다.
- **AND** `npm`과 `mise`는 `run` 인수를 포함한다.
- **AND** 안내는 기존 런타임·패키지 관리자·빌드 명령·CI를 보존하는 조건과 함께 제공한다.
