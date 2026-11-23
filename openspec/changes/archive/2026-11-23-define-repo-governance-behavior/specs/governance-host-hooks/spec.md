# Spec Delta

## Purpose

Codex Desktop, Claude Code와 pi가 지원 도구의 실행 전 입력을 같은 공통 검사기로 확인한다.
사용자는 호스트에 전달된 판정과 실제 도구의 실행 여부를 관측할 수 있다.

## ADDED Requirements

### Requirement: Connect the common skill and pre-execution adapter to supported hosts

배포물은 Codex와 Claude Code에 `PreToolUse` 훅을, pi에 `tool_call` 확장을 제공해야 한다(MUST).
각 연결은 같은 배포물의 스킬과 규칙을 참조해야 한다(MUST).

#### Scenario: Codex Desktop에서 신뢰한 훅을 사용

- **WHEN** 사용자가 설치한 플러그인의 훅을 활성화하고 앱이 현재 정의를 신뢰한 상태에서 지원 도구를 호출한다.
- **THEN** Codex 등록은 `PreToolUse`에서 플러그인 경로의 공통 연결을 실행하도록 구성된다.
- **AND** Windows 등록은 해당 플랫폼의 플러그인 루트 변수로 경로를 해석한다.

#### Scenario: Claude Code 또는 pi에서 배포물로 세션을 시작

- **WHEN** Claude Code가 배포 루트의 플러그인을 로드하거나 pi가 배포물의 extension과 스킬을 로드한다.
- **THEN** Claude Code 등록은 명령과 인수로 `PreToolUse` 연결을 실행하도록 구성된다.
- **AND** Claude Code 등록은 `onFailure: "block"`을 선언하며 실제 적용은 이를 지원하는 호스트에 의존한다.
- **AND** pi 확장은 호스트가 제공한 `context.cwd`와 실제 도구 입력을 공통 연결에 전달한다.

#### Scenario: 표준 PreToolUse 입력으로 지원 도구를 호출

- **WHEN** Codex 또는 Claude Code가 `tool_name`, `tool_input`과 현재 `cwd`가 있는 `PreToolUse`를 전달한다.
- **THEN** 연결부는 해당 도구와 작업 경로로 후보를 해석한다.
- **AND** 지원 셸 도구 이름에는 `Bash`, `PowerShell`, `exec_command`, `shell_command`, `shell`이 포함된다.
- **AND** `exec_command`에는 `cmd`를, 나머지 지원 셸 도구에는 `command`를 사용한다.

### Requirement: Classify actual supported tool effects before inspection

연결부는 호스트가 전달한 실제 도구 이름과 인자에서 지원 변경을 판별해야 한다(MUST).
알려진 변경의 대상이나 후보를 확정할 수 없으면 그 변경을 보류해야 한다(MUST).

#### Scenario: 조회와 실제 변경이 호출됨

- **WHEN** 호스트가 조회, 도움말, 인용 문자열 또는 지원 변경의 실제 입력을 전달한다.
- **THEN** 연결부는 조회와 인용을 검사 범위 없음으로 처리한다.
- **AND** 지원 변경에는 확인한 Git·GitHub·파일 후보의 해당 규칙만 검사한다.

#### Scenario: 알려진 변경이 여러 효과나 동적 입력을 포함

- **WHEN** 지원 대상인 변경을 인식했지만 복합 요청이나 동적 값으로 전체 후보를 판단할 수 없다.
- **THEN** 도입한 검사 범위에서 연결부는 필요한 후보와 함께 `needs-context`를 보고한다.
- **AND** 분류 결과가 미지원 또는 검사 범위 없음이면 결과는 실제 적용 범위를 보여준다.

### Requirement: Return the host-specific outcome for an invoked check

실제로 실행된 연결은 공통 검사 결과와 입력 오류를 해당 호스트의 실행 전 응답으로 바꿔야 한다(MUST).

#### Scenario: 세 호스트의 같은 기계 위반

- **WHEN** 세 연결이 같은 공통 후보에서 위반, 자료 부족 또는 오류를 얻는다.
- **THEN** Codex와 Claude Code 연결은 `hookSpecificOutput.permissionDecision: "deny"`와 사유를 반환한다.
- **AND** pi는 `block: true`와 사유를 반환한다.
- **AND** 잘못된 훅 입력이나 연결부 예외는 `CHECK-ERROR`가 든 거절 결과로 전달한다.

#### Scenario: 검사한 기계 조건을 통과함

- **WHEN** 실제 수행한 검사에서 공통 결과가 모두 `pass`다.
- **THEN** Codex와 Claude Code 연결은 `additionalContext`에 실제 검사 범위를 제공하고, pi는 차단 응답 없이 callback을 마친다.
- **AND** 원래 도구의 실행 권한과 의미 판단은 각각 호스트 및 작업 에이전트가 처리한다.

### Requirement: Surface unadopted scopes without interrupting the original tool

연결부는 실제 대상이 미도입인 지원 변경에서 `not-adopted`를 보고하고 원래 도구가 진행할 수 있는 결과를 반환해야 한다(MUST).

#### Scenario: 같은 미도입 범위의 지원 변경을 pi에서 반복

- **WHEN** 같은 cwd와 같은 도입 범위의 지원 변경을 pi에서 연속 호출한다.
- **THEN** pi 확장은 첫 호출에서만 실제 판정 JSON을 화면과 모델 문맥에 전달한다.
- **AND** 통지는 현재 턴에 기록되며 새 모델 턴 없이 처리된다.
- **AND** 범위가 달라지거나 검사를 수행한 상태를 거친 뒤 미도입이 되면 다시 표시한다.
- **AND** 세션 트리 이동이나 압축 후에도 다음 지원 변경에서 다시 표시한다.

#### Scenario: 조회 호출 또는 미도입 통지 실패

- **WHEN** pi 확장이 조회를 받거나 미도입 통지를 보내는 동작에서 오류를 받는다.
- **THEN** 조회는 통지를 생성하지 않는다.
- **AND** 통지 오류 뒤 원래 도구의 허용을 유지하고 다음 지원 변경에서 통지를 다시 시도한다.

### Requirement: Qualify support by the evidence collected at the host

지원 검증은 설치 상태, 프로토콜 결과와 실제 세션 관측을 각각의 증거에 연결해야 한다(MUST).

#### Scenario: 훅 프로세스나 callback만 실행

- **WHEN** 시험에서 훅 프로세스의 JSON 또는 pi callback 결과만 관측했다.
- **THEN** 시험 결과는 프로토콜 동작에 한정한다.
- **AND** 실제 호스트 수용 여부를 확인할 때는 스킬 사용, 기계 위반 거절, 에이전트의 의미 적용 보류, 호스트 한계와 도구의 전후 상태를 실제 세션에서 확인한다.

#### Scenario: 신뢰, 설정 또는 호스트 상태 때문에 호출을 관측하지 못함

- **WHEN** 훅이 누락되거나 비활성화됐거나 신뢰·기동·시간 제한 때문에 실제 응답을 확인하지 못했다.
- **THEN** 검증 결과는 해당 연결 상태와 실제 원래 도구의 실행 상태를 기록한다.

#### Scenario: native 검증 명령에 증거를 제공

- **WHEN** 호출자가 `verify:native`에 현재 bundle, 해당 호스트와 표면, 관측 사례 및 첨부의 해시가 일치하는 완전한 증거를 제공한다.
- **THEN** 명령은 `evidence-consistent`와 `nativeVerified: false`를 보고한다.
- **AND** 증거가 없으면 절차와 `unverified`를, 관측 종류가 빠졌으면 불완전한 상태를 보고한다.
