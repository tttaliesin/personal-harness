# Windows Agent Devkit

Windows 개발 프로젝트에 맞는 도구를 권장하고 현재 환경을 읽기 전용으로 점검하는 로컬 Codex 플러그인입니다.
사용자가 직접 실행할 확인 명령도 안내합니다.
Node.js·Python·Go·Rust·Zig·C#과 Windows 네이티브·WSL 2·Docker·Process Compose를 다룹니다.

[권장 개발환경](docs/windows-environment.md) · [작업 실행기 선택](docs/task-runners.md) · [CLI 사용법](docs/diagnostic-cli.md) · [30개 점검 항목](docs/environment-checks.md)

자동 검사와 실제 Codex 앱에서 확인한 결과는 [검증 기록](docs/verification.md)에 있습니다.
0.3.2·0.3.3의 WSL 작업 등록 절차는 [과거 사용법](docs/wsl-task-registration.md)에 있습니다.

## 설치본 빠른 시작

실행 환경은 Windows 11 x64, Node.js 24 이상, PowerShell 7입니다.
PowerShell 권장 계열은 7.6 LTS입니다.

1. [로컬 플러그인 설치](#로컬-플러그인-설치)를 마칩니다.
2. `$pluginRoot`에 설치본의 `skills/environment-doctor/SKILL.md`가 있는 디렉터리에서 두 단계 위의 절대 경로를 넣습니다.
3. `$projectRoot`에 점검할 기존 프로젝트의 절대 경로를 넣습니다.
4. 아래 명령을 실행한 뒤 JSON의 `checks`에서 30개 점검 결과를 확인합니다.

```powershell
$pluginRoot = 'C:/path/to/installed/windows-agent-devkit'
$projectRoot = 'C:/src/example'
$cli = Join-Path $pluginRoot 'dist/cli.mjs'
node $cli doctor --project $projectRoot --format json
```

`doctor`는 점검의 적용 여부·경로·버전·호환성·권장 구성과의 차이를 표준 출력으로 보고합니다.
`--format json`을 생략하면 한국어 텍스트로 표시합니다.
`--wsl`, `--containers`, `--process-compose`는 해당 호스트 도구와 설정을 점검합니다.
다른 경로에 저장된 기존 유지 사유는 [`--state-dir` 옵션](docs/diagnostic-cli.md#기존-유지-사유-읽기)으로 읽을 수 있습니다.

## 로컬 플러그인 설치

저장소 루트에서 [개발과 확인](#개발과-확인)의 패키지 생성과 검사를 마칩니다.
같은 저장소 루트에서 생성한 로컬 마켓플레이스를 등록합니다.
아래 명령의 마지막 결과에서 플러그인 설치를 확인합니다.

```powershell
codex plugin marketplace add ./.local/plugin-marketplace --json
codex plugin add windows-agent-devkit@windows-agent-devkit-local --json
codex plugin list --marketplace windows-agent-devkit-local --json
```

앱의 플러그인 화면을 새로 고쳐 Windows Agent Devkit을 확인합니다.
새 대화에서는 플러그인이 제공하는 유일한 Skill인 `$environment-doctor`로 대상 프로젝트의 점검을 요청합니다.
설치 패키지에는 의존성을 포함한 CLI가 들어 있습니다.

## 점검 결과와 수동 확인 명령

`unknown`은 근거가 부족한 상태입니다.
`skipped`는 검사 범위에서 제외한 상태입니다.
Rust 링크·WSL 배포판 내부·Docker 엔진/서비스·Process Compose의 실제 동작은 `RUST-02`, `WSL-02`, `CTR-02`, `PC-02`에 각각 `skipped`로 표시합니다.

`commandGuidance`는 사용자에게 안내할 도구·인수·설명을 담은 JSON 배열입니다.
안내할 명령이 있으면 텍스트 보고서의 **직접 실행할 명령** 절에 표시합니다.
사용자는 해당 프로젝트에 맞는 명령을 골라 직접 실행합니다. [수동 확인 명령](docs/diagnostic-cli.md#수동-확인-명령)

`doctor`는 mise tasks·Taskfile·Justfile·Makefile·npm scripts와 CI 호출을 정적으로 대조해 실행기를 권장합니다.
지원하지 않는 동적 설정은 `unknown`으로 남깁니다. [작업 실행기 선택](docs/task-runners.md)

## 개발과 확인

다음 명령은 저장소 루트에서 순서대로 실행합니다.

```powershell
npm ci --ignore-scripts
node scripts/build.mjs
node --test
node scripts/check-package.mjs
node scripts/package-plugin.mjs
node scripts/check-package.mjs --packaged
```

Windows CI에서 동작 테스트와 설치 패키지 검사를 실행합니다.
소스 검사는 저장소의 `dist/cli.mjs`가 현재 빌드와 일치하는지 확인합니다.
`--packaged`는 생성한 패키지의 번들을 현재 소스에서 다시 빌드한 바이트와 대조한 뒤 독립 실행을 검사합니다.
공식 지원 판정은 확인일과 유효기간이 있는 오프라인 정책을 사용합니다.

전체 범위와 적용 제한은 [프로젝트 범위](docs/project-scope.md)에 기록합니다.
