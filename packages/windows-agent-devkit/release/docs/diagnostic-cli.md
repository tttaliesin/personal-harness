# 진단 CLI 사용법

`doctor`는 Windows 개발환경을 읽기 전용으로 점검하고 도구와 수동 확인 명령을 안내합니다.
이전 버전의 실제 Windows 호스트·Codex 앱 관찰은 [검증 기록](verification.md)에서 확인할 수 있습니다.

## 실행 전제조건

실행 기준은 Windows 11 x64, Node.js 24 이상과 PowerShell 7입니다.
진단 CLI와 대상 프로젝트의 런타임 요구는 각각 확인합니다.

1. 플러그인을 설치합니다. [로컬 설치 절차](../README.md#로컬-플러그인-설치)
2. `$pluginRoot`에 설치본의 `skills/environment-doctor/SKILL.md`가 있는 디렉터리에서 두 단계 위의 절대 경로를 넣습니다.
3. `$projectRoot`에 점검할 기존 프로젝트의 절대 경로를 넣습니다.

```powershell
$pluginRoot = 'C:/path/to/installed/windows-agent-devkit'
$projectRoot = 'C:/src/example'
$cli = Join-Path $pluginRoot 'dist/cli.mjs'
```

## 기본 점검

CLI 명령은 `doctor`이며 생략해도 같은 명령을 실행합니다.
다음 예시에서 필요한 조회 범위를 선택합니다.
기본 출력은 한국어 텍스트입니다.
JSON이 필요하면 `--format json`을 지정합니다.
두 형식 모두 표준 출력으로 반환합니다.

```powershell
node $cli doctor --project $projectRoot
node $cli doctor --project $projectRoot --format json
node $cli doctor --project $projectRoot --languages node,python --native
node $cli doctor --project $projectRoot --wsl --containers --process-compose
node $cli doctor --project $projectRoot --app --format json
node $cli --help
node $cli --version
```

`doctor`는 상위 버전 선언과 명시적인 패키지 작업 공간을 분석합니다.
GitHub Actions의 정적 버전 행렬은 로컬 버전 요구와 구분합니다.
Python 가상환경과 Compose·Process Compose 설정은 필요한 필드만 읽습니다.
단독 Compose의 DB 서비스는 앱의 컨테이너 실행 근거로 취급하지 않습니다.
유효한 devcontainer와 CI 전용 요구는 호스트 언어의 적용 상태에 별도 근거로 반영합니다.

작업 실행기는 mise tasks·Taskfile·Justfile·Makefile·npm scripts에서 정적으로 확인합니다.
목록 조회와 dry run도 설정을 평가할 수 있으므로 자동 실행하지 않습니다.
외부 포함 파일과 지원하지 않는 동적 표현의 사유는 `unknown`으로 남깁니다. [작업 실행기 선택](task-runners.md)

## 옵션

| 옵션 | 의미 |
| --- | --- |
| `--project <경로>` | 대상 프로젝트를 선택합니다. |
| `--format <text\|json>` | 표준 출력의 형식을 선택합니다. |
| `--languages <목록>` | `auto`나 `node,python,go,rust,zig,dotnet`에서 고른 계열의 쉼표 목록을 받습니다. |
| `--native` | 호스트 언어 도구를 점검할 문맥을 명시합니다. |
| `--wsl` | WSL 클라이언트와 등록된 배포판의 호스트 정보를 조회합니다. |
| `--containers` | Docker 클라이언트·Compose와 로컬 context 정보를 조회합니다. |
| `--process-compose` | Process Compose 경로와 설치 정보 및 프로젝트 설정을 점검합니다. |
| `--state-dir <경로>` | 이미 저장된 프로젝트의 유지 사유를 읽을 경로를 지정합니다. |
| `--app`, `--ide`, `--github-auth` | 앱·IDE·GitHub 인증의 선택적 점검을 요청합니다. |
| `--storage <경로>` | 파일 시스템과 Dev Drive 지정을 확인할 볼륨 경로를 선택합니다. |
| `--codex-executable <경로>` | 앱과 공유하는 설치 목록 조회에 사용할 Codex 실행 파일을 지정합니다. |
| `--timeout-ms <정수>` | 개별 조회의 제한 시간을 지정합니다. 기본값은 5000ms입니다. |
| `--help`, `--version` | 도움말과 CLI 버전을 표시합니다. |

`--timeout-ms`는 100~30000ms 범위의 정수를 받습니다.
`--app`과 `--ide`는 메타데이터 조회 범위를 선택합니다.
`--github-auth`는 GitHub CLI의 원격 인증 조회를 요청합니다.
보고서는 인증 값을 제외합니다.

### 기존 유지 사유 읽기

기본 상태 디렉터리는 `LOCALAPPDATA/WindowsAgentDevkit/state`입니다.
다른 위치에 기록이 이미 있으면 `--state-dir`에 저장소 밖의 해당 절대 경로를 넣습니다.
경로 끝에 `state`를 자동으로 붙이지 않습니다.
`doctor`는 대상 프로젝트의 기록을 읽기만 합니다.
JSON의 `exceptions`에서 기존 유지 사유를 확인합니다.

```powershell
$devkitState = 'C:/path/to/existing/devkit-state'
node $cli doctor --project $projectRoot --state-dir $devkitState --format json
```

## 결과 해석

`checks`에는 P0 22개와 P1 8개를 합친 30개 점검 ID가 들어 있습니다.
각 결과는 [해당 ID의 확인 범위](environment-checks.md)에 한정합니다.

| 상태 | 의미 |
| --- | --- |
| `pass` | 확인 범위에서 요구를 충족했습니다. |
| `fail` | 허용한 조회에 실패했거나 프로젝트 요구 위반을 확인했습니다. |
| `warn` | 권장 차이·지원 종료·검토할 선언이 있습니다. |
| `unknown` | 해석·조회·지원 근거가 부족합니다. |
| `skipped` | 요구가 없거나 진단 범위에서 제외한 항목입니다. |

`resolution`, `execution`, `compatibility`, `support`, `recommendation`은 각기 다른 관찰을 기록합니다.
조회는 경로와 PE 형식을 확인한 실행 파일에 허용한 읽기 전용 인수를 전달합니다.
명령을 찾지 못하면 조회한 셸과 프로젝트 경로를 기준으로 해석합니다.

공식 지원은 2026-11-17에 확인한 오프라인 정책 스냅샷으로 판정합니다.
유효기간은 30일이며 만료일은 2026-12-17입니다.
기간 밖의 조회와 정책에 수록하지 않은 도구는 `unknown`으로 남깁니다.
패치 최신성·취약점 상태·다른 플랫폼의 지원은 별도 근거가 필요합니다.

| 종료 코드 | 의미 |
| --- | --- |
| 0 | 실패 판정 없이 결과를 생성했습니다. |
| 1 | 점검 항목에 실패 판정이 있습니다. |
| 2 | 옵션·입력·실행 전제조건 등에 오류가 있습니다. |

## 수동 확인 명령

`RUST-02`, `WSL-02`, `CTR-02`, `PC-02`는 사용자가 직접 확인할 항목입니다.
`doctor`는 해당 ID를 `skipped`로 보고하고 `reason`에 `manual_confirmation`을 표시합니다.
이 네 항목에서 확인할 대상은 [선택 점검과 수동 확인](environment-checks.md#선택-점검과-수동-확인)에 있습니다.

JSON의 `commandGuidance` 배열에서 `tool`은 도구 이름, `args`는 순서대로 전달할 문자열 인수, `description`은 확인할 내용을 뜻합니다.
다음은 현재 Docker context의 버전을 확인하는 예시입니다.

```json
{
  "commandGuidance": [
    {
      "tool": "docker",
      "args": ["version"],
      "description": "현재 Docker 문맥의 클라이언트와 엔진 버전 확인"
    }
  ]
}
```

안내할 명령이 있으면 텍스트 보고서의 **직접 실행할 명령** 절에 표시합니다.
사용자는 명령의 작업 경로·대상·예상 동작을 살펴본 뒤 필요한 명령을 직접 실행합니다.
실행 결과는 사용자가 실행한 터미널에서 확인합니다.

## 개발 검사

소스 체크아웃에서 빌드·검사·패키지 생성을 실행하는 순서는 [빌드와 패키지](implementation-plan.md#빌드와-패키지)에 있습니다.
