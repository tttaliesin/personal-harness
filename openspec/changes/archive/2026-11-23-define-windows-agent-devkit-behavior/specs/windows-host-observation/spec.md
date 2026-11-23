# Spec Delta

## Purpose

현재 Windows 진단 문맥의 운영체제, 셸과 명령 후보를 재현할 수 있게 관찰한다.
선택한 호스트 도구와 서비스 설정은 읽기 전용으로 확인하고, 실제 실행 검증에 필요한 근거는 사용자에게 안내한다.

## ADDED Requirements

### Requirement: Collect Windows host metadata in a profile-free diagnostic shell

진단은 절대 PATH 항목의 검증 가능한 `pwsh.exe`에서 내장 호스트 수집기를 실행하고 고정된 명령 이름의 후보와 실행 문맥을 읽어야 한다(MUST).

#### Scenario: 프로젝트 경로의 문자 그대로 전달

- **WHEN** Windows 프로젝트 경로에 공백이나 셸에서 해석할 수 있는 문자가 포함된다.
- **THEN** CLI는 `collect-host.ps1`에 경로를 하나의 인수로 전달한다.
- **AND** 수집기는 `-NoProfile`, `-NonInteractive`로 실행하고 파일 시스템의 프로젝트 경로를 사용한다.
- **AND** OS·프로세스 아키텍처, 진단 셸의 경로·버전, `profileApplied: false`를 반환한다.
- **AND** 후보 순서와 종류, 파일 경로와 읽을 수 있는 파일 버전을 기록한다.
- **AND** 기본 후보 수집 자체에서 해당 도구를 실행하지 않는다.

#### Scenario: 수집기의 CIM 접근 제한

- **WHEN** PowerShell 수집기는 시작했지만 로컬 CIM에서 운영체제나 현재 프로세스 정보를 얻지 못한다.
- **THEN** 현재 프로세스와 로컬 레지스트리의 읽기 전용 메타데이터로 계속 수집한다.
- **AND** `context.metadataSource`는 정상 CIM 수집에서 `local-cim`, 대체 수집에서 `local-process-and-registry`다.
- **AND** 대체 수집은 클라이언트 빌드가 `22000` 이상이고 제품명이 Windows 10으로 남은 경우 Windows 11로 보정한다.
- **AND** 기존 명령 후보 목록과 프로필을 읽지 않은 진단 셸 정보를 같은 계약으로 반환한다.

#### Scenario: 수집 자체의 실패와 플랫폼 제한

- **WHEN** Windows가 아니거나, 검증 가능한 PowerShell이 없거나, 수집 프로세스가 실패·시간 초과하거나, 출력이 호스트 JSON 계약을 위반한다.
- **THEN** CLI는 수집 오류를 보고하고 종료 코드 `2`로 끝난다.
- **AND** CIM 대체 수집은 PowerShell 실행이 가능한 경우에만 적용한다.
- **AND** Windows 11 x64의 확인 범위는 `ENV-01`에 기록하고, 그 근거가 부족한 Windows 환경은 `unknown`으로 기록한다.

### Requirement: Run only bounded and verified metadata queries

호스트 진단과 추가 조회는 검증한 실행 파일에 허용된 조회 인수만 전달해야 한다(MUST).

#### Scenario: 요청한 도구의 절대 경로와 실행 검증

- **WHEN** 조회를 선택한 명령에 래퍼·실행 별칭·심·프로젝트 내부 파일 또는 검증된 Windows PE 후보가 있다.
- **THEN** 진단은 현재 명령 후보의 순서를 보존하고, 근거를 확인한 외부 네이티브 실행 파일만 실행한다.
- **AND** 기본 수집은 첫 후보가 미검증 래퍼인 경우 뒤의 후보를 대신 실행하지 않는다.
- **AND** 추가 조회는 허용된 절대 경로를 직접 확인하거나 인수가 없는 정적 심 메타데이터의 대상을 확인할 수 있다.
- **AND** 불확실하거나 링크·프로젝트 내부·상대 PATH에서 온 후보는 조회 `not_run`과 사유를 반환한다.
- **AND** 조회를 선택한 명령의 후보가 없으면 `not_found`로, 조회를 선택하지 않은 명령은 `not_run`으로 구분한다.

#### Scenario: 조회 범위와 자식 프로세스 제한

- **WHEN** 검증된 경로에 고정 인수로 Git·Node.js·Python 또는 다른 선택 도구의 메타데이터를 조회한다.
- **THEN** 셸 해석 없이 인수 배열을 전달하고 제한 시간과 출력 크기를 적용한다.
- **AND** 진단용 환경은 PATH·PATHEXT 등 필요한 실행 정보만 상속하고 시작 후크·주입 설정·인증 환경 값은 전달하지 않는다.
- **AND** Python 조회는 바이트코드 쓰기, 사용자 환경과 `site` 초기화를 차단한다.
- **AND** 시간 초과나 출력 한도 초과 시 해당 조회가 만든 자식만 중지하고 산출한 상태와 사유를 반환한다.
- **AND** 보고서는 원시 표준 출력·표준 오류와 환경변수 값을 제외한다.

#### Scenario: 부작용을 확인하지 못한 명령

- **WHEN** 버전 확인에 설치·동기화·프로필 실행·서비스 기동을 유발할 수 있는 명령이나 미검증 도구가 필요하다.
- **THEN** 기본 조회는 Go 실행, Python 실행 관리자, rustup, 패키지 관리자 래퍼, Lazydocker TUI와 Process Compose 프로그램의 실행을 보류한다.
- **AND** 안전한 버전·설치 메타데이터를 얻을 수 있으면 그 범위만 보고한다.
- **AND** 기존 프로젝트 설정과 사용자 프로필을 변경하지 않는다.

### Requirement: Observe WSL from the Windows host

`--wsl`은 WSL 클라이언트와 등록된 배포판의 호스트 정보를 확인하고 배포판 내부 실행은 수동 확인으로 남겨야 한다(MUST).

#### Scenario: WSL 버전과 배포판 목록의 부분 성공

- **WHEN** 호출자가 `--wsl`을 지정한다.
- **THEN** 진단은 검증한 호스트 실행 파일에 `--version`과 `--list --verbose`만 사용한다.
- **AND** 호스트 버전과 파싱한 배포판 목록을 모두 확보하면 `WSL-01`을 `pass`로 보고한다.
- **AND** 버전만 확보하거나 목록을 해석할 수 없으면 `unknown`으로 보고한다.
- **AND** 명령 후보가 없으면 선택한 문맥에서 `fail`로 보고한다.
- **AND** 배포판 내부 점검 `WSL-02`는 `skipped`로 두며, 사용자가 직접 실행할 호스트 목록 명령을 안내한다.

#### Scenario: WSL을 선택하지 않은 기본 진단

- **WHEN** 호출자가 `--wsl`을 생략한다.
- **THEN** WSL 호스트 점검은 `skipped`이며 버전 조회나 배포판 기동을 수행하지 않는다.

### Requirement: Observe Docker clients and configuration without contacting the engine

선택한 컨테이너 진단은 Docker 클라이언트, 로컬 context, 검증된 Compose 플러그인과 Lazydocker 메타데이터를 관찰해야 한다(MUST).

#### Scenario: 적용되는 Docker 클라이언트와 Compose

- **WHEN** `--containers`를 선택했거나 유효한 컨테이너 선언을 확인한다.
- **THEN** `CTR-01`은 Docker 클라이언트 버전, 성공적으로 확인한 context와 endpoint 종류, 검증한 Compose 플러그인 실행 파일의 직접 버전 조회를 근거로 `pass`를 판정한다.
- **AND** 엔진은 `not_contacted`로 기록하고, 플러그인 임의 탐색이나 컨테이너 기동을 하지 않는다.
- **AND** 필수 문맥에서 Docker 후보를 찾지 못하면 `docker_not_resolved`와 `fail`을 반환한다.
- **AND** 후보가 있어도 버전·context·Compose 근거가 부족하면 `unknown`을 반환한다.
- **AND** `CTR-02`를 수동 확인으로 두고, 적용되는 경우 `docker version`과 루트의 표준 Compose 파일에 대한 `docker compose ps`를 안내한다.

#### Scenario: Lazydocker의 명령과 설정

- **WHEN** 컨테이너 점검에 Lazydocker를 고려한다.
- **THEN** `LD-01`은 명령 후보와 읽을 수 있는 설정의 Compose 명령 종류·사용자 명령 유무를 보여준다.
- **AND** 원시 명령 값은 제외하고 `tui: not_started`, `engine: not_contacted`를 기록한다.

### Requirement: Inspect Process Compose declarations without evaluating services

Process Compose 진단은 설정의 정적 메타데이터와 실행 파일 후보를 확인해야 한다(MUST).

#### Scenario: 확인 가능한 서비스 설정

- **WHEN** `--process-compose`를 선택했거나 프로젝트에 Process Compose 설정이 있다.
- **THEN** `PC-01`은 셸·작업 경로·프로세스 의존 조건·건강 확인·포트의 확인 가능한 구조를 보고한다.
- **AND** 명령 후보와 해석한 설정 근거가 있으면 정적 확인을 `pass`로 판정한다.
- **AND** 요구가 확인된 상태에서 명령 후보가 없으면 `fail`을 반환한다.
- **AND** 설정의 적용 여부나 필요한 구문을 해석할 수 없으면 `unknown`으로 남긴다.

#### Scenario: 동적 표현과 서비스 검증

- **WHEN** 설정이 외부 포함이나 동적 표현을 사용한다.
- **THEN** 영향받는 항목에 미확인 근거를 남기고 독립적으로 확인 가능한 필드는 보존한다.
- **AND** 설정의 명령과 환경 값은 평가하지 않고 `serviceExecution: not_run`을 기록한다.
- **AND** `PC-02`는 수동 확인으로 두고 사용자가 PowerShell에서 `Get-Command process-compose`로 경로를 확인할 수 있게 안내한다.
