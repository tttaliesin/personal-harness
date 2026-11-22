# 모듈 계약

이 문서는 읽기 전용 진단 모듈의 입력과 출력을 설명합니다.
명령 형식은 [진단 CLI 사용법](diagnostic-cli.md)에 있습니다.

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
