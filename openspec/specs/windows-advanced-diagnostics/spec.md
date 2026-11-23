# Windows 추가 진단

## Purpose

기본 언어 진단의 도구 선택 근거를 보완하고, 사용자가 선택한 앱 설치 목록·편집기·볼륨·GitHub 인증의 확인 범위를 명시한다.
각 조회는 확인 가능한 메타데이터와 실패·미확인 사유를 제공한다.

Windows Agent Devkit 공개 배포본 `0.3.5`의 추가 조회를 기준으로 삼는다. [배포 CLI](../../../packages/windows-agent-devkit/release/dist/cli.mjs)

## Requirements

### Requirement: Inspect mise selection without applying its configuration

`TOOLS-01`은 안전하게 읽을 수 있는 mise 선언, 설치 목록과 현재 도구의 경로를 대조해야 한다(MUST).

#### Scenario: 정적 설정에서 설치와 경로 선택 확인

- **WHEN** 적용되는 언어 요구가 있고 프로젝트·상위·사용자 설정을 안전하게 확인한다.
- **THEN** 검증한 mise에서 `--version`, `ls --installed --json`과 적용 도구의 `which`만 사용한다.
- **AND** 설치 목록, 선택 경로와 실제 진단 문맥의 경로를 관찰한다.
- **AND** 확인한 경로가 다르면 `warn`으로 보고한다.
- **AND** 선언한 관리 도구의 부재가 입증되면 `fail`을 반환하고, 경로·조회 근거가 부족하면 `unknown`을 반환한다.
- **AND** mise 명령을 찾지 못한 경우는 권장 구성의 차이로 `warn`을 반환한다.

#### Scenario: 안전한 조회를 막는 동적 설정과 공식 SDK 예외

- **WHEN** 관련 설정에 지원하지 않는 외부 백엔드·동적 설정·해석할 수 없는 인수가 포함된다.
- **THEN** 설정 평가와 추가 mise 조회를 보류하고 `unknown`으로 보고한다.
- **AND** 별도 언어 요구 미확인이 없는 .NET SDK 전용 프로젝트에서는 공식 설치 예외를 표시하고 mise 점검을 `skipped`로 둔다.

### Requirement: Distinguish installed .NET components from project SDK selection

`DOTNET-01`은 설치한 SDK와 런타임, 프로젝트가 선택한 SDK를 각각 확인해야 한다(MUST).

#### Scenario: 실제 SDK 선택과 정책 비교

- **WHEN** .NET SDK가 필요한 프로젝트에 지원하는 `global.json` 정책이 있다.
- **THEN** 설치 SDK와 공유 런타임 목록을 각각 읽고 `version`, `rollForward`, `allowPrerelease`로 SDK 후보를 계산한다.
- **AND** 프로젝트 경로에서 실제 선택한 SDK를 임시 CLI 홈으로 확인하고 조회 뒤 임시 디렉터리를 정리한다.
- **AND** 설치 목록과 실제 선택이 정책에 부합할 때 `pass`로 보고한다.
- **AND** 공유 런타임만 설치됐거나 확인한 SDK가 정책을 위반하면 `fail`로 보고한다.

#### Scenario: 상위 선언과 안전한 선택 조건

- **WHEN** 실제 SDK 선택기에 적용될 수 있는 가장 가까운 `global.json`을 확인한다.
- **THEN** 프로젝트 정적 탐색 경계 밖의 상위 선언도 선택 조회 전 확인한다.
- **AND** 가까운 선언이 잘못됐거나 `sdk.paths`에 선택을 검증할 수 없는 경로가 있으면 관리되는 SDK의 버전 조회를 보류하고 `unknown`을 반환한다.
- **AND** 설치 목록을 읽었어도 실제 선택 또는 런타임 목록을 검증하지 못하면 `pass`를 반환하지 않는다.

### Requirement: Inspect local Git and tracked line endings

진단은 현재 Git과 저장소의 읽기 접근, 인증 도우미 선언, 지원하는 줄바꿈 정책을 로컬 조회로 확인해야 한다(MUST).

#### Scenario: 로컬 저장소와 인증 도우미

- **WHEN** 확인한 Git에서 버전과 저장소 루트를 읽을 수 있다.
- **THEN** `GIT-01`은 로컬 저장소 접근을 판정하고 알려진 인증 도우미 이름 또는 가린 사용자 정의 표식을 남긴다.
- **AND** 인증 도우미의 미설정과 조회 근거 부족을 구분한다.
- **AND** 인증 도우미를 호출하거나 명령 본문·인수·인증 값을 공개하지 않는다.
- **AND** 저장소가 아님을 확인한 경우는 `fail`, 접근 거부나 출력에서 확인하지 못한 경우는 `unknown`으로 기록한다.

#### Scenario: 추적 파일의 줄바꿈과 정책 차이

- **WHEN** Git의 추적 파일 인덱스와 작업 트리 줄바꿈을 조회할 수 있다.
- **THEN** `GIT-02`는 적용되는 `.gitattributes`와 `.editorconfig`에 대한 줄바꿈 위반·정책 충돌을 보고한다.
- **AND** 바이너리 표시 파일은 대조에서 제외하고, 정책을 찾지 못한 파일의 혼합 줄바꿈을 검토 대상으로 남긴다.
- **AND** 지원하지 않는 정책이나 출력은 확인한 범위와 미확인 사유를 남긴다.
- **AND** 실제 파일 인코딩 검증은 `encodingVerification: not_run`으로 기록한다.

### Requirement: Observe the requested app installation list

`--app`은 선택한 Codex 실행 파일로 레거시 `windows-agent-devkit-local`의 설치 목록을 조회해야 한다(MUST). [배포 CLI의 설치 목록 조회](../../../packages/windows-agent-devkit/release/dist/cli.mjs#L14933-L14945)

#### Scenario: 설치와 활성 상태 확인

- **WHEN** 호출자가 `--app`을 선택하고 검증한 Codex 실행 파일을 찾는다.
- **THEN** CLI는 `plugin list --marketplace windows-agent-devkit-local --json`을 사용한다.
- **AND** `--codex-executable`을 지정하면 해당 경로를 조회 전에 검증한다.
- **AND** 목록에서 설치가 확인되면 `CODEX-01`은 버전과 활성 상태를 반환하고 비활성 설치는 `warn`으로 표시한다.
- **AND** 스킬 실제 호출의 관찰은 `separate_app_evidence_required`로 기록한다.

#### Scenario: 설치 목록에 없거나 설치 상태를 확인할 수 없는 경우

- **WHEN** 정상 응답의 명시적 `installed` 목록에 플러그인이 없다.
- **THEN** `CODEX-01`은 `fail`과 `local_plugin_not_installed`를 반환한다.
- **AND** 설치 상태를 뒷받침하지 않는 목록이나 확인할 수 없는 응답은 `unknown`으로 보고한다.
- **AND** `--app`을 생략하면 `CODEX-01`은 `skipped`이며, 실행 파일 경로 지정만으로 설치 목록을 조회하지 않는다.

#### Scenario: 공개 마켓플레이스 설치의 진단 범위

- **GIVEN** Devkit을 공개 `personal-harness` 마켓플레이스에만 설치했다.
- **WHEN** `--app` 조회가 `windows-agent-devkit-local`의 정상 응답을 받고 `installed` 목록에 Devkit이 없다.
- **THEN** `CODEX-01`은 조회한 로컬 목록에 한해 `fail`과 `local_plugin_not_installed`를 반환한다.
- **AND** 공개 설치 여부는 `personal-harness` 설치 목록의 근거로 확인한다.

### Requirement: Inspect editor and applicable native-build metadata

`IDE-01`은 확인 가능한 편집기 설치와 적용 근거가 있는 네이티브 빌드 구성의 메타데이터를 조회해야 한다(MUST).

#### Scenario: `--ide` 또는 발견한 편집기 설치

- **WHEN** 호출자가 `--ide`를 선택하거나 지원하는 위치에서 VS Code 설치 근거를 발견한다.
- **THEN** 실행하지 않고 설치 패키지 또는 파일 버전 메타데이터를 보고한다.
- **AND** PATH에서 `code`가 없어도 설치 메타데이터를 근거로 쓸 수 있다.
- **AND** 래퍼만 발견하고 설치 근거를 확보하지 못하면 `unknown`으로 기록한다.
- **AND** `--ide`가 지정됐지만 설치 근거와 경로가 모두 없으면 `warn`을 반환한다.

#### Scenario: 네이티브 빌드 요구가 주어진 진단 입력

- **WHEN** 진단 입력이 MSVC 또는 Windows SDK 요구를 제공한다.
- **THEN** 확인 가능한 x64의 Visual Studio 설치 정보, MSVC 컴파일러와 Windows SDK 헤더·라이브러리 파일을 필요한 범위에서 조회한다.
- **AND** 확인한 구성 요소 부재는 `fail`, 설치 조회 거부·근거 부족·지원 범위 밖 아키텍처는 `unknown`으로 구분한다.
- **AND** 공개 `--ide`는 편집기 점검 요청이며, 그 옵션만으로 MSVC 또는 Windows SDK를 필수로 지정하지 않는다.

### Requirement: Separate local auxiliary tools from remote GitHub authentication

`AUX-01`은 검색·GitHub CLI의 로컬 버전과 요청한 원격 인증 확인을 각각 보고해야 한다(MUST).

#### Scenario: 로컬 버전과 선택한 원격 인증 조회

- **WHEN** `rg`나 `gh` 후보가 있거나, 호출자가 `--github-auth`를 선택한다.
- **THEN** 진단은 적용되는 도구의 검증된 로컬 경로와 버전을 보고한다.
- **AND** `--github-auth`를 지정했고 `gh` 버전을 확인했을 때만 `gh auth status --active --hostname github.com`을 호출한다.
- **AND** 해당 조회가 성공하면 `authenticated`를 기록하고 확인할 수 없으면 `unknown`으로 남긴다.
- **AND** 선택한 인증에 필요한 `gh` 후보가 없으면 `fail`을 반환한다.
- **AND** 토큰·계정 출력·인증 환경 값은 보고서에서 제외하며 로그인은 실행하지 않는다.

### Requirement: Inspect the selected volume and Dev Drive designation

`--storage`는 지정한 로컬 볼륨의 파일 시스템과 Dev Drive 지정 여부만 조회해야 한다(MUST).

#### Scenario: 폴더가 속한 단일 볼륨 조회

- **WHEN** 호출자가 로컬 드라이브의 경로를 `--storage`로 전달한다.
- **THEN** 내장 `collect-advanced.ps1`은 대상 경로가 속한 하나의 볼륨에서 파일 시스템·드라이브 또는 볼륨 GUID·용량을 읽는다.
- **AND** `fsutil devdrv query`는 그 볼륨만 조회한다.
- **AND** ReFS와 Dev Drive 지정을 각각 보고하고, 지정된 Dev Drive에서 신뢰 상태를 기록한다.
- **AND** Dev Drive가 아님을 확인하면 권장 구성의 차이로 `warn`을 반환한다.

#### Scenario: 조회 조건을 확인하지 못한 볼륨

- **WHEN** 선택을 생략하거나, UNC 경로·권한 제한·지원하지 않는 출력·서로 맞지 않는 볼륨 근거가 발생한다.
- **THEN** 선택을 생략하면 `skipped`, 근거를 확인할 수 없으면 `unknown`을 반환한다.
- **AND** 볼륨 생성, 파일 이동, 보안 정책 변경과 성능 측정은 수행하지 않는다.
