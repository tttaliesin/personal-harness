# Windows 진단 CLI

## Purpose

설치된 Windows Agent Devkit의 읽기 전용 진단을 호출하고, 결과를 사용자와 연동 도구가 같은 기준으로 해석할 수 있게 한다.
대상 프로젝트와 진단 도구의 실행 조건을 각각 확인한다.

기준선은 Personal Harness 커밋 `a0eca5178f9b58ad727debaf5686a38076014e9e`에 포함된 Windows Agent Devkit 공개 배포본 `0.3.5`다. [배포 매니페스트](../../../packages/windows-agent-devkit/release/.codex-plugin/plugin.json)
배포 기록의 Devkit 원본 이관 커밋은 `2ccf5538f6ebfd6c0179c9467ae53c10a18f76d4`다. [배포 기록](../../../docs/deployment.md#자체-플러그인-소스와-배포본)

## Requirements

### Requirement: Invoke the installed read-only diagnosis

설치본은 단일 `environment-doctor` 스킬과 설치 루트의 `dist/cli.mjs`를 통해 읽기 전용 진단을 제공해야 한다(MUST).

#### Scenario: 설치 루트 밖에서 스킬 실행

- **WHEN** 사용자가 Windows 프로젝트의 개발 도구와 작업 실행기 점검을 요청한다.
- **THEN** 스킬은 자신의 디렉터리에서 두 단계 위의 설치 루트를 찾는다.
- **AND** Node.js 24 이상과 PowerShell 7을 진단의 실행 기준으로 사용한다.
- **AND** 설치본에 포함된 의존성을 사용하고 설치 디렉터리에서 `npm install`을 실행하지 않는다.
- **AND** 확인한 프로젝트 경로를 `--project`의 단일 인수로 전달하고 `--format json`으로 결과를 읽는다.

#### Scenario: 배포 메타데이터 확인

- **WHEN** Codex가 공개 `0.3.5` 설치본의 매니페스트와 `skills/`를 읽는다.
- **THEN** 플러그인 이름은 `windows-agent-devkit`이고 기능 표시는 `Read`다.
- **AND** 설치본에는 `environment-doctor` 한 개가 포함된다.

### Requirement: Accept only documented diagnostic commands and options

CLI는 명시하거나 생략한 `doctor`와 도움말·버전 요청을 처리하고, 알 수 없는 명령·옵션과 잘못된 인수를 거부해야 한다(MUST).

#### Scenario: 기본 호출과 형식 지정

- **WHEN** 호출자가 `doctor` 명령 또는 명령 이름 없이 옵션으로 CLI를 호출한다.
- **THEN** CLI는 `--project`를 현재 디렉터리 기준으로 해석하고 생략하면 현재 디렉터리를 사용한다.
- **AND** `--format`을 생략하면 한국어 `text`를 출력하고 `--format json`이면 JSON을 출력한다.
- **AND** `--timeout-ms`는 조회별 100~30000ms의 정수를 받고 생략하면 5000ms를 적용한다.

#### Scenario: 언어와 실행 문맥 지정

- **WHEN** 호출자가 `--languages`를 생략하거나 `auto`를 지정한다.
- **THEN** CLI는 프로젝트 선언에서 언어 도구의 적용 범위를 정한다.
- **AND** 명시 목록은 `node`, `python`, `go`, `rust`, `zig`, `dotnet`의 쉼표 구분 값으로 받으며, 각 항목의 앞뒤 공백과 중복을 제거한다.
- **AND** `--native`는 호스트의 언어 도구 요구를 별도로 확인하도록 선택한다.

#### Scenario: 선택 진단과 경로 지정

- **WHEN** 호출자가 진단 옵션을 선택한다.
- **THEN** CLI는 `--wsl`, `--containers`, `--process-compose`로 호스트 조회 범위를 지정한다.
- **AND** `--app`, `--ide`, `--storage <경로>`, `--github-auth`로 각 추가 진단을 선택한다.
- **AND** `--codex-executable <경로>`는 `--app`의 조회 실행 파일을 지정한다.
- **AND** `--state-dir <경로>`는 기존 유지 사유의 읽기 범위를 지정한다.

#### Scenario: 호스트 진단 없이 도움말 또는 버전 확인

- **WHEN** 호출자가 유효한 인수로 `--help` 또는 `-h`를 지정한다.
- **THEN** CLI는 호출 형식·진단 옵션·종료 코드를 표준 출력에 표시하고 코드 `0`으로 끝난다.
- **AND** `--version`만 선택하면 `0.3.5`를 표준 출력에 표시하고 코드 `0`으로 끝난다.
- **AND** 두 옵션을 함께 주면 도움말을 출력한다.
- **AND** 이 호출에서 프로젝트 분석과 호스트 수집을 실행하지 않는다.

#### Scenario: 이전 쓰기·실행 진입점과 잘못된 입력 거부

- **WHEN** 호출자가 `validate`, `apply`, `wsl-register`, `doctor --execute`, `doctor --output` 또는 지원하지 않는 다른 명령이나 옵션을 사용한다.
- **THEN** CLI는 입력 오류로 표준 오류에 메시지를 출력하고 코드 `2`로 끝난다.
- **AND** 지원하지 않는 언어 계열·출력 형식, 값 없는 옵션, 허용 범위 밖 제한 시간이나 남는 위치 인수에도 같은 종료 코드를 적용한다.

### Requirement: Report the thirty diagnostic checks and guidance

완료한 `doctor`는 고유한 점검 ID 30개의 판정과 근거를 보고하고, 수동 확인에 사용할 명령을 안내해야 한다(MUST).

#### Scenario: JSON의 고정 점검 계약

- **WHEN** `doctor --format json` 진단이 완료된다.
- **THEN** 표준 출력에 `schemaVersion: 1`, 플러그인·정책 버전, 관찰 시각과 실행 문맥, 프로젝트 범위, `checks`와 `summary`를 포함한 단일 JSON을 반환한다.
- **AND** P0 ID는 `ENV-01`, `ENV-02`, `SH-01`, `PATH-01`, `REQ-01`, `PKG-01`, `GIT-01`, `GIT-02`, `NODE-01`, `NODE-02`, `PY-01`, `PY-02`, `GO-01`, `RUST-01`, `ZIG-01`, `DOTNET-01`, `TOOLS-01`, `WSL-01`, `CTR-01`, `LD-01`, `PC-01`, `RCM-01` 순서다.
- **AND** 이어서 P1 ID `RUST-02`, `WSL-02`, `CTR-02`, `PC-02`, `IDE-01`, `CODEX-01`, `AUX-01`, `STORE-01`을 반환한다.
- **AND** 각 ID의 `status`를 `pass`, `fail`, `warn`, `unknown`, `skipped` 중 하나로 기록하고 상태별 개수를 `summary`에 합산한다.
- **AND** `applicability`, `resolution`, `execution`, `compatibility`, `support`, `recommendation`과 상태의 `reason`을 각각 기록한다.

#### Scenario: 프로젝트 명령과 서비스의 수동 검증

- **WHEN** 진단을 완료한다.
- **THEN** `RUST-02`, `WSL-02`, `CTR-02`, `PC-02`는 `skipped`, `manual_confirmation`, `not_run`으로 반환한다.
- **AND** 적용되는 언어 버전·인프라·기존 작업 확인 명령은 `commandGuidance`에 `tool`, `args`, `description`을 가진 항목으로 표시한다.
- **AND** 텍스트 보고서는 안내 항목이 있으면 **직접 실행할 명령** 절에 표시한다.
- **AND** 사용자가 선택한 작업 경로와 터미널에서 안내 명령을 직접 실행한다.

### Requirement: Distinguish a completed report from a diagnostic error

CLI는 보고서의 실패 판정 유무와 보고서를 만들 수 없는 입력·수집 오류를 서로 다른 종료 코드로 알려야 한다(MUST).

#### Scenario: 실패 판정 없이 진단 완료

- **WHEN** 보고서의 `summary.fail`이 `0`이다.
- **THEN** CLI는 표준 출력에 보고서를 쓰고 코드 `0`으로 끝난다.
- **AND** `warn`, `unknown`, `skipped` 항목의 원래 상태를 보존한다.

#### Scenario: 실패 판정이 있는 진단 완료

- **WHEN** 현재 진단 문맥의 필수 명령 누락 등으로 보고서에 `fail` 항목이 하나 이상 있다.
- **THEN** CLI는 실패 근거를 포함한 보고서를 표준 출력에 쓰고 코드 `1`로 끝난다.

#### Scenario: 진단 자체를 완료할 수 없는 입력 또는 오류

- **WHEN** 경로가 존재하지 않거나 디렉터리가 아니거나, 플랫폼·PowerShell 전제조건 오류 또는 복구 대상이 아닌 수집 오류가 발생한다.
- **THEN** CLI는 진단을 완료하지 못한 사유를 표준 오류에 표시하고 코드 `2`로 끝난다.
- **AND** 성공적으로 생성한 진단 보고서를 표준 출력에 반환하지 않는다.

### Requirement: Read previously saved maintenance reasons

진단은 선택한 상태 디렉터리에서 대상 프로젝트의 기존 유지 사유를 조회하고 JSON의 `exceptions`에 표시해야 한다(MUST).

#### Scenario: 지정 경로와 기본 경로

- **WHEN** 호출자가 `--state-dir`로 저장소 밖의 기존 상태 디렉터리를 지정한다.
- **THEN** CLI는 지정한 경로를 해석해 사용하며 끝에 `state`를 붙이지 않는다.
- **AND** 생략하면 `LOCALAPPDATA/WindowsAgentDevkit/state`를 읽는다.
- **AND** 대상 프로젝트에 해당하는 유효한 기록이 있으면 JSON의 `exceptions`에 저장된 사유를 반환한다.

#### Scenario: 기록 누락, 허용하지 않는 경로 또는 손상된 기록

- **WHEN** 선택한 위치에 프로젝트의 유지 사유 파일이 없다.
- **THEN** `exceptions`는 빈 배열이며 진단은 상태 파일이나 디렉터리를 생성하지 않는다.
- **AND** 저장소 내부·프로젝트의 상위 경로·링크 등 허용하지 않는 위치, 기본 위치를 확인할 수 없는 환경 또는 유효하지 않은 상태 파일에는 `state: unknown`과 사유를 반환한다.
- **AND** 유지 사유 읽기 오류만으로 전체 진단을 중단하지 않는다.
