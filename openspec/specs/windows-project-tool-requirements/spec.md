# Windows 프로젝트 도구 요구

## Purpose

지정한 프로젝트의 개발 도구 요구를 정적 선언에서 읽고, 실제 진단 문맥에서 확보한 관찰로 요구와 권장 구성의 차이를 설명한다.
언어 도구의 적용 범위와 공식 지원 근거를 각각 제공한다.

Windows Agent Devkit 공개 배포본 `0.3.5`의 프로젝트 도구 진단을 기준으로 삼는다. [배포 진단 문서](../../../packages/windows-agent-devkit/release/docs/diagnostic-cli.md)

## Requirements

### Requirement: Read local tool requirements from recognized declarations

진단은 지원하는 선언 파일에서 Node.js·Python·Go·Rust·Zig·.NET SDK의 적용 상태와 버전 근거를 읽어야 한다(MUST).

#### Scenario: 언어별 버전과 의존성 선언 분류

- **WHEN** 지원하는 프로젝트 파일에 버전과 패키지 관리 정보가 있다.
- **THEN** `package.json`의 `engines`·`devEngines`, `.nvmrc`·`.node-version`과 Node.js 관리자 선언·잠금 파일을 각 역할의 근거로 기록한다.
- **AND** `pyproject.toml`의 Python 요구, `.python-version`, Conda의 Python 선언과 Python 관리자·잠금 파일을 읽는다.
- **AND** `go.mod`·`go.work`의 `go`와 `toolchain`을 각각 최소 요구와 선호 도구 모음으로 읽는다.
- **AND** `go.sum`과 `go.work.sum`은 무결성 파일로만 기록한다.
- **AND** Cargo의 `rust-version`과 `rust-toolchain`의 채널·도구 모음 선택을 따로 기록한다.
- **AND** `.zig-version`의 고정 버전과 `build.zig.zon`의 최상위 `minimum_zig_version`을 각각 읽는다.
- **AND** .NET 프로젝트·솔루션 표식과 `global.json`의 SDK 버전·`rollForward`·`allowPrerelease`·`paths` 선언을 확인한다.
- **AND** mise `[tools]`와 `.tool-versions`에서 지원하는 언어별 버전을 읽는다.

#### Scenario: 표식만 있거나 선언이 충돌한 경우

- **WHEN** 버전 없는 표식만 있거나 서로 다른 파일에서 충돌하는 고정 버전을 발견한다.
- **THEN** 표식만으로 적용할 버전을 추정하지 않는다.
- **AND** 충돌하는 고정 버전은 해당 요구와 선택 상태를 `unknown`으로 보존하고 출처를 기록한다.
- **AND** 명시적 언어 선택으로도 해석하지 못한 선언은 `unknown`으로 유지한다.

### Requirement: Bound declaration discovery and parsing

진단은 프로젝트와 적용되는 선언 범위에 한정해 파일을 읽고, 읽기·탐색·해석의 한도를 넘으면 그 영향을 보고해야 한다(MUST).

#### Scenario: 상위 선언과 패키지 작업 공간

- **WHEN** 중첩 프로젝트를 진단한다.
- **THEN** 저장소·적용되는 작업 공간·사용자 홈·파일 시스템 경계를 고려해 상위 선언을 찾고 `project.scope`에 분석 범위를 기록한다.
- **AND** 적용되는 가까운 `global.json`과 언어 버전 파일을 선택한다.
- **AND** mise와 `.tool-versions`는 언어별로 가까운 선언을 적용한다.
- **AND** 가장 가까운 선언이 잘못됐으면 해당 버전을 미확인으로 남긴다.
- **AND** 지원하는 npm·pnpm 작업 공간 패턴의 구성원과 제외 목록을 반영하고, 선언되지 않은 하위 소스나 의존성 폴더는 탐색하지 않는다.

#### Scenario: 경계 밖 참조와 선언 읽기 실패

- **WHEN** 선언이 링크, 경계 밖 참조, 지원하지 않는 동적 표현, 잘못된 문법 또는 제한 초과 파일을 포함한다.
- **THEN** 해당 파일이나 필드의 미확인 이유를 기록한다.
- **AND** 선언 본문 읽기 256 KiB, 선언 128개, 탐색 깊이 32단계의 한도를 적용한다.
- **AND** 허용한 정적 메타데이터와 오류 사유를 보고하며, 외부 포함·스크립트·환경 값은 실행하거나 평가하지 않는다.

### Requirement: Apply language tools in their declared execution context

진단은 정적 프로젝트 요구, CI 요구, 현재 호스트에 적용되는 도구 요구를 각각 판정해야 한다(MUST).

#### Scenario: 보조 서비스 전용 Compose 프로젝트

- **WHEN** 호스트 언어 선언이 있는 프로젝트에 DB 등 보조 서비스를 위한 단독 Compose 파일이 있다.
- **THEN** Compose 서비스 요구를 기록하고 로컬 언어 도구의 호스트 적용을 보존한다.

#### Scenario: devcontainer 또는 CI 전용 요구

- **WHEN** 유효한 devcontainer가 해당 언어의 컨테이너 작업 문맥을 정하거나 언어 근거가 CI에만 있다.
- **THEN** 기본 진단은 해당 언어를 Windows 호스트의 필수 설치에서 제외한다.
- **AND** GitHub Actions의 정적 버전 행렬은 별도 근거로 보존한다.
- **AND** devcontainer 참조가 잘못됐거나 설정이 충돌하면 호스트 적용 상태를 `unknown`으로 기록한다.
- **AND** `--native` 또는 해당 언어를 명시한 `--languages`를 선택하면 호스트 도구의 적용을 별도로 확인한다.

### Requirement: Compare verified versions using project semantics

언어 점검은 해석한 프로젝트 요구를 확인된 실행 버전 또는 검증 가능한 파일 메타데이터와 비교해야 한다(MUST).

#### Scenario: 명령 해석 실패, 조회 실패와 확인된 위반

- **WHEN** 호스트가 요구한 언어 명령을 현재 문맥에서 찾지 못한다.
- **THEN** 점검은 `fail`과 `not_resolved`를 반환하고 진단 문맥을 근거로 제시한다.
- **AND** 후보가 있지만 안전한 버전 조회가 보류되거나 시간 초과되면 `unknown`을 반환한다.
- **AND** 확인한 버전이 해석 가능한 적용 범위를 만족하면 `compatibility: satisfied`를 반환한다.
- **AND** 그 범위에서 벗어남을 확인하면 버전 요구의 출처와 함께 `compatibility: violated`를 반환한다.

#### Scenario: 언어별 버전 해석과 선택 근거

- **WHEN** 프로젝트에 Node.js 범위, Python 비교식, Rust 채널, Go 선호 도구 모음이나 .NET SDK 선택 정책이 있다.
- **THEN** Node.js 범위와 Python 비교식을 각 언어의 규칙으로 비교한다.
- **AND** 같은 관리자 선언의 여러 버전은 선택 대안으로 처리한다.
- **AND** Go `toolchain` 선호 차이만으로 `go` 최소 요구의 위반을 만들지 않는다.
- **AND** Go 버전은 검증한 Windows 실행 파일의 내장 버전 정보가 있으면 프로세스를 실행하지 않고 읽는다.
- **AND** Rust 프록시에서 실제 도구 모음을 검증할 수 없으면 채널·버전 확인을 보류한다.
- **AND** .NET은 설치 SDK 목록과 프로젝트가 선택한 SDK를 구분해 SDK 버전과 feature band 정책을 판단한다.

### Requirement: Report dependency tooling and environment observations separately

진단은 패키지 관리 선언과 실제 도구·가상환경의 관찰을 해당 언어 버전의 요구와 별도로 기록해야 한다(MUST).

#### Scenario: Node.js 패키지 관리자와 잠금 파일

- **WHEN** Node.js 프로젝트에 다른 관리자나 서로 다른 잠금 파일의 근거가 있다.
- **THEN** `NODE-02`에 해당 선언과 검토할 차이를 표시한다.
- **AND** 확인 가능한 npm·pnpm·Yarn의 설치 메타데이터는 선언된 관리자 버전과 비교한다.
- **AND** 패키지 설치·복원 및 관리자 proxy 실행을 수행하지 않는다.

#### Scenario: Python 가상환경의 선언과 실제 선택

- **WHEN** `.venv/pyvenv.cfg` 또는 `pyvenv.cfg`에 정적 환경 정보가 있다.
- **THEN** `PY-02`에 관찰한 환경을 보존한다.
- **AND** 안전하게 조회한 Python의 prefix가 있으면 현재 프로젝트의 환경 경로와 대조한다.
- **AND** 선택한 환경의 근거가 없거나 해석할 수 없는 경우 `unknown`을 반환한다.
- **AND** 관찰한 인터프리터 버전으로 프로젝트의 Python 요구를 덮어쓰지 않는다.

### Requirement: Evaluate support and recommendation independently of compatibility

진단은 프로젝트 호환성, 오프라인 공식 지원 정책, 권장 도구 구성의 일치 여부를 서로 독립된 근거로 보고해야 한다(MUST).

#### Scenario: 지원 정책의 유효기간과 판정 범위

- **WHEN** 공식 지원을 비교한다.
- **THEN** `2026-11-17`부터 `2026-12-17`까지 유효한 오프라인 스냅샷을 사용하고 확인일과 근거를 남긴다.
- **AND** 기간 밖의 날짜, 수록하지 않은 시험판·미래 계열, 판정 근거 없는 도구 및 에디션은 `unknown`으로 기록한다.
- **AND** 지원 종료 계열의 `pass`는 `warn`으로 바꾸되 프로젝트 호환성 값을 보존한다.
- **AND** 최신 패치·취약점·플랫폼 조합의 지원은 이 계열 판정으로 확정하지 않는다.

#### Scenario: 현재 도구와 권장 역할 비교

- **WHEN** 프로젝트가 다른 버전 관리자로 정상 동작하거나 권장 도구의 활성화 여부가 미확인이다.
- **THEN** 보고서는 진단용 PowerShell과 `7.6 LTS`의 비교, WinGet 경로, Windows Terminal 후보, mise 적용 여부의 근거를 제공한다.
- **AND** C#의 공식 .NET SDK 설치를 mise 권장 구성의 예외로 다룬다.
- **AND** 스킬은 Nushell을 선택 도구로 설명하고, 기존 런타임·패키지 관리자·잠금 파일·빌드·테스트 명령과 CI의 보존 조건을 함께 안내한다.
- **AND** 권장 구성의 차이만으로 언어 런타임 요구의 실패를 만들지 않는다.
