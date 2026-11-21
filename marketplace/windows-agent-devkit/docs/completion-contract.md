# 모듈 계약

이 문서는 읽기 전용 진단 모듈의 입력과 출력을 설명합니다.
명령 형식은 [진단 CLI 사용법](diagnostic-cli.md)에 있습니다.
이전 버전의 실제 호스트와 앱 관찰은 [검증 기록](verification.md)에서 확인합니다.

## 공통 계약

Node.js 24 이상과 PowerShell 7을 실행 기준으로 사용합니다.
진단은 프로젝트의 정적 분석과 허용한 읽기 전용 조회로 구성합니다.
소스 설정·환경 값·인증 값·원시 명령 출력은 사용자 보고서에 복사하지 않습니다.
조회 실패와 요구 위반은 서로 다른 결과입니다.

`doctor`는 P0 22개와 P1 8개를 합친 30개 ID를 보고합니다.
판정은 `pass`, `fail`, `warn`, `unknown`, `skipped`를 사용합니다.
적용 대상·경로 해석·실행·호환성·공식 지원·권장 차이는 별도 필드입니다.
`RUST-02`, `WSL-02`, `CTR-02`, `PC-02`의 상태는 `skipped`, 사유는 `manual_confirmation`입니다.

## 프로젝트 분석

`analyzeProject(projectPath)`는 `{root, requirements, environment, files, issues, metadata}`를 반환합니다.
`requirements`의 키는 `node`, `python`, `go`, `rust`, `zig`, `dotnet`입니다.
각 언어는 `{state, versionRequests, packageManagers, lockFiles, metadata, notes}`를 유지합니다.
요구 상태는 `required | not_required | unknown`입니다.
버전 요청은 `{source, field, kind, value}`입니다.
버전 종류는 `exact`, `minimum`, `range`, `channel`, `preferred`, `sdk`입니다.
`environment`는 `containers`와 `processCompose`의 요구 상태입니다.
`issues`의 각 항목은 `{source, message}`입니다.

| 최상위 메타데이터 | 현재 계약 |
| --- | --- |
| `scope` | `boundary`, `boundaryKind`, `ancestorDirectories`, `maxDepth`, `maxFiles`, `maxBytes`입니다. |
| `declarations[]` | `source`, `kind`, `scope`, `distance`, `selectedLanguages`, 선택적 `unresolvedFields`입니다. |
| `workspaces[]` | `source`, `kind`, `state`, `patterns`, `members`, `notes`, 선택적 `root`입니다. |
| `ci[]` | `source`, `provider`, `state`, `jobs`, `notes`입니다. |
| `taskRunners[]` | `tool`, `source`, `state`, `tasks`, `notes`와 선택적 `taskDetails`입니다. |
| `taskRunnerCI[]` | `source`, `job`, `step`, `tool`, `state`, `executionLocation`과 선택적 `task`, `atProjectRoot`, `kind`입니다. |
| `taskRunnerWorkflows[]` | 반복된 정적 절차의 `jobs`, `operations`, `prepared`와 선택적 `fileDependency`입니다. |
| `taskRunnerPreferences[]` | 루트의 정적 실행기 버전 선택을 확인한 `tool`과 `source`입니다. |
| `taskRunnerLanguages[]` | 로컬 프로젝트 선언으로 확인한 언어 계열입니다. |
| `processCompose` | `source`, `sources`, `services`, `dynamicEnvironment`, `configurations`, 선택적 `shell`입니다. |
| `compose` | `sources`, `services`, `dynamicEnvironment`, `configurations`입니다. |
| `devcontainer` | 있는 경우 `source`, `runtimeLocation`, `configurations`, 선택적 `composeFiles`입니다. |
| `pythonVenv` | 있는 경우 `{environments}`입니다. |
| `dockerfiles[]` | `{source, runtimeLocation}`입니다. |
| `execution` | `location`, 여섯 언어의 `hostLanguages`, 근거 배열 `evidence`입니다. |

Process Compose 요약의 셸은 `{command, argument?}`입니다.
서비스 요약은 `{name, source, workingDir?, dependencies, healthCheck}`입니다.
`dependencies`는 서비스 이름 배열입니다.
`healthCheck`는 `{defined, type?, port?}`입니다.
Compose 서비스 요약은 `{name, source, image?, build?, profiles?}`입니다.
설정별 `configurations`는 셸·경로·의존 조건·건강 확인·포트의 정적 상태와 미확인 사유를 보존합니다.

`execution.location`은 `host | container | unknown`입니다.
`execution.hostLanguages`는 언어별 호스트 적용 상태입니다.
`execution.evidence[]`는 `{source, kind, location, reason}`입니다.
단독 Compose는 호스트 언어 적용을 자동 제외하지 않습니다.
유효한 devcontainer는 선택한 컨테이너 작업 문맥을 명시합니다.

CI 요구는 언어별 `metadata.ciRequirements`에도 기록합니다.
이 항목은 `source`, `job`, `step`, `language`, `field`, `state`, `versionRequests`, `executionLocation`, `notes`와 선택적 `versionFile`을 포함합니다.
CI 행렬의 대안 버전을 로컬 요청의 교집합에 넣지 않습니다.
Python의 `metadata.virtualEnvironments`는 `pythonVenv.environments`와 같은 관찰입니다.
가상환경 버전은 프로젝트의 버전 요구를 대체하지 않습니다.

## 호스트와 조회

`inspectWindows({projectPath, timeoutMs, tools})`는 `{context, commands, probes}`를 반환합니다.
`context.diagnosticShell`은 셸의 이름·경로·버전과 프로필 적용 여부를 기록합니다.
명령 후보와 실제 조회 실행 파일은 구분합니다.
실행 파일은 경로·일반 파일 여부·PE 형식 등의 검증을 통과해야 합니다.
검증되지 않은 wrapper·proxy·shim의 실행은 보류합니다.
로컬 CIM 조회가 거부되면 프로세스·레지스트리 메타데이터의 읽기 전용 대체 경로를 사용합니다.
이 대체 경로는 샌드박스 권한 완화를 요청하지 않습니다.

`createQuery({projectPath, host, timeoutMs, environment, run})`는 `query(tool, args, options)`를 반환합니다.
기본 조회는 고정된 도구와 읽기 전용 인수 배열만 허용합니다.
반환값은 `state`, `stdout`, `stderr`, `exitCode`, `executable`, `arguments`, 선택적 `reason`을 포함합니다.
`stdout`과 `stderr`는 내부 해석용이며 보고서의 공개 계약이 아닙니다.
각 진단 모듈은 필요한 값만 추출하고 원시 출력을 제거합니다.

## 추가 진단과 인프라

`collectAdvanced({projectPath, project, host, timeoutMs, query})`는 `{checks, observations}`를 반환합니다.
담당 ID는 `TOOLS-01`, `DOTNET-01`, `GIT-01`, `GIT-02`, `IDE-01`, `AUX-01`, `STORE-01`입니다.
mise 설치 목록과 실제 경로, .NET SDK 선택과 런타임 목록을 구분합니다.
Git 인증 도우미와 정책은 허용한 메타데이터로 제한합니다.
IDE·보조 도구·저장소 볼륨은 요청과 적용 근거에 따라 조회합니다.

`collectInfrastructure({project, host, options, query})`는 `{checks}`를 반환합니다.
담당 ID는 `NODE-02`, `PY-02`, `WSL-01`, `CTR-01`, `LD-01`, `PC-01`입니다.
Docker context와 Compose 버전 조회를 엔진 기동·연결 검증과 구분합니다.
서비스 설정의 정적 확인을 실제 서비스 준비 완료로 바꾸지 않습니다.
앱 점검 `CODEX-01`은 통합 보고서에서 별도 선택 문맥으로 처리합니다.
`src/app-check.mjs`는 선택한 Codex 실행 파일을 사용해 앱 공유 설치 목록을 조회합니다.
설치 목록의 확인은 실제 Skill 호출 확인을 대신하지 않습니다.

## 공식 지원 정책

`assessSupport(tool, version, {now, os})`는 릴리스 계열의 정책 판정을 반환합니다.
`attachSupport(checks, host, now)`는 해당 근거를 점검 결과에 연결합니다.
스냅샷은 `checkedOn: 2026-11-17`, `validUntil: 2026-12-17`입니다.
유효기간은 30일입니다.
기간 밖의 조회와 수록하지 않은 도구는 `unknown`으로 남깁니다.
패치 최신성과 플랫폼 전체 지원 여부는 릴리스 계열 판정과 별도입니다.

## 기존 유지 사유

`src/exceptions.mjs`의 `loadExceptions(projectRoot, stateDir)`는 대상 프로젝트에 이미 저장된 유지 사유를 읽습니다.
기본 상태 경로는 `LOCALAPPDATA/WindowsAgentDevkit/state`입니다.
`stateDir`를 명시하면 지정한 저장소 밖 경로를 사용합니다.
파일이 없으면 빈 배열을 반환합니다.
`doctor`는 읽기 오류를 `exceptions.state: "unknown"`으로 표시합니다.

## 수동 확인 명령

`report.commandGuidance`는 `{tool, args, description}` 객체의 배열입니다.
`tool`은 도구 이름, `args`는 문자열 인수 배열, `description`은 확인할 내용입니다.
작업 명령은 프로젝트 루트의 선언과 연결된 CI 호출에서 확인한 이름을 사용합니다.
텍스트에서는 항목이 있을 때 **직접 실행할 명령**에 표시합니다.
사용자가 프로젝트에 맞는 문맥에서 명령을 직접 실행합니다.

## 작업 실행기 계약

`metadata.taskRunners`는 mise tasks·Taskfile·Justfile·Makefile·npm scripts의 정적 선언 배열입니다.
각 `state`는 `declared | unknown`입니다.
`tasks`에는 정적으로 확인한 작업 이름만 포함합니다.
`taskRunnerCI.kind`로 의존성 설치, 실행기 준비, 버전 확인을 작업 호출과 구분합니다.
선택적 `taskDetails`는 `{name, shell?, directory?, environmentKeys?, dependencies?}`입니다.
셸에는 알려진 실행 파일과 인수만 기록합니다.
원시 작업 명령과 환경 변수 값은 포함하지 않습니다.
포함 파일·파일 작업·동적 계산의 미지원 의미는 `unknown`과 사유로 남깁니다.

`report.taskRunners`는 `recommended`, `declarations`, `ci`, `tools`, `recommendation`, `proposal`, `limitations`입니다.
`recommended`는 한 실행기를 선택한 경우의 `mise | task | just | make | npm` 또는 `null`입니다.
여러 기존 실행기를 유지하는 경우와 판단 보류에는 `null`을 사용합니다.
`recommendation.action`은 `keep | suggest | defer`입니다.
`recommendation.tools`에는 판정에 해당하는 실행기를 배열로 기록합니다.
`recommendation.evidence`에는 근거가 된 선언·CI 위치·도구 선택을 기록합니다.
CI 단계 번호는 JSON에서 0부터 시작합니다.
기존 실행기는 자동 변환하지 않습니다.
`recommendation.status`는 `aligned | different | unknown`입니다.
이 판정은 프로젝트 작업의 실행 성공과 별도입니다.
`tools`는 버전 조회의 실행 상태·버전·실제 실행 파일 경로를 기록합니다.
정적 선언과 CI 관찰만으로 특정 실행기의 Windows 설치를 필수라고 확정하지 않습니다.

기존 30개 ID에는 `REQ-01`, `PATH-01`, `TOOLS-01`, `ENV-02`, `SH-01`, `RCM-01`의 근거를 연결합니다.
진단에서 실행기 호출은 허용한 버전 조회로 제한합니다.

## 빌드와 확인 범위

TOML·YAML·Node 버전·Python 버전은 고정한 실행 의존성 네 개로 해석합니다.
esbuild는 별도 빌드 의존성입니다.
설치용 CLI는 실행 의존성을 포함한 Node.js 24 대상의 번들입니다.
실제 호스트와 Codex 앱의 검증 완료는 모듈 연결이나 단위 테스트의 통과만으로 선언하지 않습니다.

버전별 실제 실행과 앱 설치본의 근거는 [검증 기록](verification.md)에 기록합니다.

## 이전 계약 이력

0.2에서 진단 모듈과 30개 점검 ID를 연결했습니다.
아래는 설정·기동 검증·WSL 작업 등록을 제공하던 버전의 계약입니다.
이전 버전의 수용 기준과 결과는 해당 버전의 기록으로 읽습니다.

### 설정과 복구

`src/configure.mjs`는 `createPlan`, `applyPlan`, `rollbackPlan`, `saveException`, `loadExceptions`를 내보냅니다.
각 함수는 옵션 객체 하나를 받습니다.
공통 프로젝트 경로는 `projectPath`입니다.
공통 상태 경로는 저장소 밖의 `stateDir`입니다.
기본 상태 루트는 `LOCALAPPDATA/WindowsAgentDevkit/state`입니다.
직접 전달한 `stateDir`는 하위 폴더를 덧붙이지 않고 그대로 사용합니다.

| 함수 | 주요 입력 | 결과와 실행 경계 |
| --- | --- | --- |
| `createPlan` | `roles`, `versions`, `profilePath`, 선택적 `analysis`입니다. | 계획을 저장하며 대상 파일 변경과 설치는 실행하지 않습니다. |
| `applyPlan` | `plan`, `execute`, `query`입니다. | `execute: true`에서 검증한 계획을 적용합니다. |
| `rollbackPlan` | `id`, `journal`, `journalPath`, `execute`입니다. | 저장된 저널을 기준으로 복구하며 실행 전에는 미리보기를 반환합니다. |
| `saveException` | `role`, `reason`, 선택적 `scope`입니다. | 프로젝트와 역할의 예외를 저장하며 CLI가 `--execute`를 확인합니다. |
| `loadExceptions` | 프로젝트와 상태 경로입니다. | 해당 프로젝트에 저장된 예외를 반환합니다. |

계획은 `id`, `hash`, `selection`, `inputs`, `operations`, `differences`, `exceptionsHash`를 포함합니다.
입력과 계획·예외의 해시가 바뀌면 적용을 거부합니다.
분석 결과의 전달값만 신뢰하지 않고 변경 결정 전에 선언을 다시 읽습니다.
백업과 저널은 저장소 밖의 상태 디렉터리에 보관합니다.
같은 계획의 재적용과 무변경 결과를 구분합니다.
설치는 검증한 정확한 버전과 고정된 WinGet·mise 명령만 허용합니다.
복구는 적용 후 해시가 일치하는 자체 파일 변경에만 수행합니다.
동시 사용자 편집과 공유 설치는 보존합니다.

### 실행 검증

`validateEnvironment({projectPath, project, host, options, query})`는 `{checks, evidence}`를 반환합니다.
담당 ID는 `RUST-02`, `WSL-02`, `CTR-02`, `PC-02`입니다.
실행에는 `options.execute: true`가 필요합니다.
Rust 링크 검사는 `rustTargets`, `rustTarget`, `context: "rust"` 중 하나를 명시하면 선택됩니다.
프로젝트의 Rust 선언은 기본 진단과 이미 선택한 링크 검사의 대상 결정에 사용합니다.
WSL 대상은 `distro`와 `linuxCwd`입니다.
선택적인 `linuxTools`는 CLI의 `--linux-tools`에서 도구 이름 배열로 전달합니다.
지원하는 이름은 `bash`, `mise`, `node`, `python3`, `go`, `rustc`, `zig`, `dotnet`입니다.
생략하면 bash·mise와 프로젝트 요구가 적용되는 언어 도구를 조회합니다.
Docker 대상은 `dockerContext`, 선택적 `image`와 `composeFile`입니다.
서비스 목록은 `services`이며 Process Compose 설정은 `serviceConfig`입니다.
선택한 작업은 CLI의 `--task-file`에서 실행 문맥과 도구·인수 배열로 전달합니다.
`context: "wsl"` 작업을 전달하면 배포판이나 작업 경로가 빠진 경우에도 `WSL-02`는 요청된 검증으로 기록합니다.
WSL과 Rust의 선택 작업 결과는 해당 ID의 `evidence.steps`에서 `phase: "task"`로 확인합니다.
앞 단계가 성공해도 선택한 작업이 생략되면 작업의 실행 상태는 `not_run`입니다.
`validate --execute`에서 선택한 검증이나 작업이 `unknown` 또는 `skipped`이면 종료 코드는 1입니다.
작업 JSON의 `context`가 허용 범위를 벗어나면 CLI 입력 오류로 종료합니다.

검증은 기동·준비 상태·종료를 구분합니다.
생성한 테스트 자원과 자식 세션만 정리합니다.
기존 서비스·이미지·볼륨·프로세스는 삭제하지 않습니다.
미선택·도구 부재·실패·준비 검사 부재는 서로 다른 근거로 보고합니다.

### 승인한 WSL 작업의 등록 계약

#### 0.3.3 공통 실행기 활성화

`wsl-enable --project <절대 경로>`는 대상 Windows 프로젝트를 읽기 전용으로 검토하고 `confirmation` 값을 반환합니다.
같은 명령에 `--execute --confirm <값>`을 추가하면 그 프로젝트의 공통 실행기를 한 번 설치합니다.
실행기는 보호된 고정 경로 `project-runner-v1/wsl-run.exe`에 둡니다.
`.codex/rules/windows-agent-devkit-wsl-runner.rules`는 선택한 프로젝트에만 추가합니다.
공통 규칙의 `allow` 명령 접두사는 해당 실행 파일의 절대 경로 한 항목입니다.
규칙과 설정에서 쓰기 대상은 이 프로젝트 규칙 파일 한 개로 한정합니다.

활성화 전에 규칙을 읽은 Codex 대화에서는 프로젝트 규칙을 한 번 다시 로드합니다.
공통 규칙을 읽은 대화에서는 이후 새로 등록한 작업을 규칙 재로딩 없이 실행할 수 있습니다.
프로젝트 신뢰와 앱의 권한 설정은 사용자가 관리합니다.
활성화 또는 등록을 적용할 때 앱이 권한 요청을 표시하면 사용자가 해당 호출을 승인합니다.

#### 등록 검토와 실행

`wsl-register`의 검토는 입력을 읽고 확인 지문을 반환하는 읽기 전용 경로입니다.
`confirmation`은 정규화된 Windows 프로젝트 경로·등록 이름·배포판·Linux 작업 경로·작업 JSON의 해석값·플러그인 버전에 결합된 SHA-256 지문입니다.
작업 JSON의 해석값에는 순서가 있는 인수 배열이 포함됩니다.
인수 원문은 작업 JSON에서 확인합니다.
등록은 `--execute --confirm <지문>`에서 입력을 다시 읽고 일치하는 지문을 확인한 경우에만 진행합니다.

공통 실행기를 사용하는 새 등록에는 등록 세대를 식별하는 UUID를 발급합니다.
해당 작업의 `wsl-register` 성공 결과와 `wsl-tasks` 목록은 `executable`과 `args`를 반환합니다.
`executable`은 공통 실행기의 절대 경로입니다.
`args`는 해당 등록 세대의 UUID 하나를 담은 문자열 배열입니다.
`wsl-tasks`는 지정한 프로젝트의 등록을 읽기 전용으로 조회합니다.
Windows 앱이 별도의 `LOCALAPPDATA`를 사용하는 경우 읽기 전용 조회가 기존 사용자 프로필의 등록 위치를 확인할 수 있습니다.

공통 실행기는 등록된 Windows 프로젝트와 같은 작업 디렉터리에서 호출해야 합니다.
실행기는 유효한 등록 세대의 UUID를 인수 하나로 받고 해당 세대의 실행 허가 파일(lease)을 확인합니다.
승인된 호출은 고정된 배포판과 Linux 작업 디렉터리에서 지정한 도구에 승인한 순서로 인수를 전달합니다.
작업 디렉터리와 도구는 해당 배포판의 네이티브 Linux 파일 시스템에 있어야 합니다.
설치본 검증에는 등록 시점과 실행 시점의 실제 경로 확인을 포함합니다.
이 요구는 Windows 작업 공간에 대한 일반 편집으로 등록한 작업의 코드나 도구가 바뀌는 경로를 줄이기 위한 것입니다.
작업의 코드·의존 작업·인터프리터는 사용자가 내용을 확인하고 신뢰하는 범위입니다.
실행 파일은 등록한 버전과 WSL 문맥 및 `WSL-02`의 작업 성공을 확인한 경우에 종료 코드 0과 결과 요약을 반환합니다.
실행 파일의 빌드에는 Windows `PATH`에서 확인한 기존 Go를 사용합니다.
기본 진단과 일회 실행 검증은 기존 실행 전제조건을 따릅니다.

`wsl-unregister --task-name <이름> --execute`는 선택한 등록 세대의 실행 허가 파일을 즉시 제거합니다.
공통 규칙은 프로젝트에 남아 다른 등록 작업에도 계속 적용됩니다.
공통 규칙을 이미 읽은 대화에서도 철회한 UUID로 작업을 새로 시작할 수 없습니다.
이미 시작한 작업은 계속 실행됩니다.
등록과 철회는 작업 이름별로 잠금을 획득합니다.
다음 등록이나 철회는 소유 프로세스의 종료를 확인한 잠금을 회수할 수 있습니다.
실행 절차는 [승인한 WSL 작업 등록 가이드](wsl-task-registration.md)를 따릅니다.

#### 0.3.2 작업별 등록 계약

기존 등록과 공통 실행기를 활성화하지 않은 프로젝트에는 0.3.2와 동일한 작업별 등록 계약을 적용합니다.
작업별 등록에서는 전용 실행 파일과 검토한 작업의 고정 사본을 프로젝트와 Git 작업 트리 밖의 `LOCALAPPDATA/WindowsAgentDevkit/approved-wsl`에 둡니다.
해당 프로젝트의 `.codex/rules/`에 전용 실행 파일의 절대 경로를 허용하는 작업별 규칙을 둡니다.
전용 실행 파일은 등록된 Windows 프로젝트 디렉터리에서 인수 없이 직접 호출합니다.
철회는 등록 활성화 파일과 작업별 규칙을 제거합니다.
봉인된 실행 파일은 이전 대화의 캐시된 규칙으로 호출해도 작업 시작을 거부합니다.
같은 이름을 다시 등록할 때마다 새 전용 실행 경로를 발급합니다.
실제 앱 관찰은 [0.3.2 검증 기록](verification.md#032-wsl-작업-등록)에 있습니다.

#### 설치본 검증 기준

아래는 0.3.3 설치본과 Codex 앱에서 확인할 기준입니다.

- 활성화와 등록의 읽기 전용 검토 전후 프로젝트 파일과 등록 상태를 대조합니다.
  읽기 전용 검토가 규칙이나 실행 파일을 만들거나 등록 상태를 바꾸거나 작업을 시작하면 실패입니다.
  검토 뒤 작업의 인수 값 또는 순서를 바꿨을 때 기존 지문으로 등록이 진행돼도 실패입니다.
- 신뢰된 Windows 프로젝트를 활성화하고 규칙 파일과 Codex 설정을 전후 대조합니다.
  공통 규칙의 명령 접두사가 고정 실행기의 절대 경로 한 항목인지 확인합니다.
  지정된 공통 규칙 이외의 프로젝트 규칙이나 Codex 설정이 바뀌면 실패입니다.
  일반 `wsl.exe` 호출이나 다른 Windows 프로젝트에서 공통 규칙으로 새 허용을 얻어도 실패입니다.
- 활성화 전에 규칙을 읽은 `workspace-write` 대화에서 공통 규칙을 한 번 다시 로드합니다.
  그 대화에서 사용자가 검토한 작업을 등록하고 결과의 `executable`과 UUID로 직접 호출합니다.
  같은 대화에서 다른 작업을 등록한 뒤 두 번째 UUID로 호출합니다.
  작업 등록 이후 규칙 재로딩이나 해당 실행의 별도 권한 승인이 필요하면 실패입니다.
  설치한 버전과 각 호출의 Linux 작업 결과 및 종료 코드를 기록합니다.
- 같은 앱에서 UUID를 빼거나 인수를 추가해 호출합니다.
  미등록 UUID와 다른 Windows 작업 디렉터리로도 각각 호출합니다.
  올바른 등록과 프로젝트 경로를 벗어난 호출이 작업을 시작하면 실패입니다.
- Windows 쪽 작업 JSON과 실행기 설정을 편집한 뒤 실행해 실제 Linux 작업 경로와 결과를 대조합니다.
  해당 Windows 편집에 따라 실행 범위나 작업 결과가 바뀌면 실패입니다.
  WSL의 Windows 드라이브 마운트나 그곳으로 해석되는 링크를 작업 디렉터리 또는 도구로 사용할 수 있으면 실패입니다.
  Windows에서 Linux 공유 경로에도 쓰기가 허용된 구성이라면 그 경로의 접근 범위를 확인하고 기록합니다.
- 첫 번째 작업의 실행을 시작한 뒤 그 작업 이름으로 철회합니다.
  실행 허가 파일의 제거와 진행 중인 작업의 완료를 확인합니다.
  같은 대화에서 첫 번째 UUID로 새 작업을 시작할 수 있거나 진행 중인 작업이 철회로 중단되면 실패입니다.
  공통 규칙 파일이 바뀌거나 두 번째 작업의 UUID가 철회의 영향을 받아도 실패입니다.
- 활성화 이전에 만든 등록과 활성화하지 않은 프로젝트에서 새 등록을 조회합니다.
  두 경우 모두 0.3.2 형식의 작업별 규칙과 같은 Windows 작업 디렉터리에서의 인수 없는 실행을 확인합니다.
  공통 실행기 활성화가 기존 등록의 경로나 규칙을 바꾸면 실패입니다.

규칙 구문의 정적 일치 결과와 실제 앱에서 실행된 Linux 작업의 결과를 각각 기록합니다.
설치 여부와 검증 결과는 [검증 기록](verification.md)에 남깁니다.

### 호스트 개발 작업

`runProjectTask({projectPath, task, execute, query, timeoutMs})`는 신뢰한 호스트 작업을 처리합니다.
작업은 `context: "native"`, `trusted: true`, `tool`, `args: string[]`을 포함합니다.
허용한 도구는 `node`, `npm`, `python`, `uv`, `go`, `cargo`, `rustc`, `zig`, `dotnet`, `pwsh`, `mise`, `task`, `just`, `make`입니다.
CLI는 `validate --execute --task-file <파일>`에서 이 입력을 전달합니다.
기본 실행 작업 경로는 `projectPath`입니다.
선택적 `cwd`와 `env`의 제약은 작업 실행기 계약을 따릅니다.
`context: "rust"`와 `context: "wsl"` 작업은 각 validator가 처리합니다.

호스트 작업의 결과는 30개 점검 ID와 별도의 보고서 `task` 필드입니다.
실행한 작업은 `status`, `execution`, `reason`, `tool`, `executable`, `exitCode`를 포함합니다.
해당 작업이 없으면 `task`는 `null`입니다.
실행 요청이 없으면 작업은 생략되며 종료 코드는 아직 없습니다.
원시 표준 출력과 표준 오류는 반환하지 않습니다.

### 서비스 실행 상태

```mermaid
stateDiagram-v2
    [*] --> 미선택
    미선택 --> 실행대상확인: 구체적인 대상 선택
    실행대상확인 --> 생략: execute 요청 없음
    실행대상확인 --> 기동: execute 요청과 전제조건 충족
    기동 --> 준비확인: 시작 성공
    준비확인 --> 정리: 완료·실패·시간 초과
    기동 --> 정리: 시작 실패
    정리 --> [*]: 자체 자원만 정리
    생략 --> [*]
```

### 작업 실행기의 선택 실행 계약

명시적으로 선택한 native 실행기를 찾지 못하면 `PATH-01`과 작업 실행을 실패로 보고합니다.

기존 30개 ID에는 `REQ-01`, `PATH-01`, `TOOLS-01`, `ENV-02`, `SH-01`, `RCM-01`의 근거를 연결합니다.
프로젝트 작업 실행 결과는 별도의 `report.task`를 유지합니다.
native JSON의 `tool`은 기존 도구와 `mise`, `task`, `just`, `make`를 허용합니다.
mise는 `args[0] === "run"`인 경로만 허용합니다.
선택적 `cwd`는 프로젝트 안의 실제 일반 디렉터리여야 합니다.
선택적 `env`는 최대 64개 문자열 키·값이며 총 32KiB로 제한합니다.
주입용 환경 변수와 설치 활성화 변수는 거부합니다.
명시적인 실행에서는 계승한 Go·Rust·Make의 기존 빌드 설정과 PowerShell 모듈 경로를 보존합니다.
읽기 전용 조회는 이 설정을 평가하지 않습니다.
보고서에는 환경 변수 이름만 포함합니다.
mise의 `MISE_AUTO_INSTALL`과 `MISE_TASK_RUN_AUTO_INSTALL`은 실행 시 `0`으로 강제합니다.
플러그인은 별도의 `mise trust`나 신뢰 경로 확장을 추가하지 않습니다.
mise 자체의 신뢰 처리는 설치한 버전과 paranoid 설정을 따릅니다.
허용한 `--version` 외 작업 목록과 dry-run은 기본 진단에서 실행하지 않습니다.
검증된 실행 파일에 argv를 직접 전달하며 기존 Windows Job Object의 정리 근거를 유지합니다.
Windows Job의 제한 시간 초과를 `timed_out`으로 보존합니다.
명시한 native 작업이 `unknown / not_run`이면 CLI 종료 코드는 1입니다.
잘못된 작업 JSON의 원문은 CLI 파서 오류에 포함하지 않습니다.

```mermaid
sequenceDiagram
    participant P as 프로젝트 선언
    participant D as doctor
    participant V as validate
    participant R as 선택한 실행기
    P->>D: 작업 이름·실행 문맥 정적 분석
    D->>R: 허용한 버전 조회
    R-->>D: 버전·경로 관찰
    D-->>V: 권장 비교와 미확인 범위
    V->>R: trusted JSON과 --execute의 선택한 작업
    R-->>V: 종료 코드·프로세스 정리 근거
```
