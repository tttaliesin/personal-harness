# Taste Windows runtime

## Purpose

Windows에 설치된 Chrome이나 Edge에서 원본 Taste 브라우저 검사를 실행한다.
실행 호환 설정의 범위는 검사 프로세스와 그 하위 프로세스로 한정한다.

## Requirements

### Requirement: Process-local browser compatibility

Windows에서 Taste의 브라우저 검사를 실행할 때 에이전트는 기존 프로젝트 폴더에서 `taste-windows-runtime`의 `scripts/run.mjs`를 사용해야 한다(MUST).
에이전트는 원본 검사 스크립트와 인수를 실행기에 그대로 전달해야 한다(MUST).
실행기는 유효한 `CHROME_PATH`를 우선하고 값이 지정되지 않았으면 설치된 Chrome이나 Edge를 찾아야 한다(MUST).
실행기는 기존 `NODE_OPTIONS` 값을 보존하고 브라우저 경로 설정을 검사 프로세스와 그 하위 프로세스에만 적용해야 한다(MUST).
호환 계층 재실행을 막는 실행 보정은 선택한 Edge의 headless 실행에만 적용해야 한다(MUST).

#### Scenario: Edge-only Windows installation

- **GIVEN** Windows에 Edge만 설치되어 있고 `CHROME_PATH`가 지정되지 않았다.
- **WHEN** 실행기가 원본 Taste 브라우저 검사를 headless 모드로 실행한다.
- **THEN** 검사 프로세스는 탐색한 Edge 경로와 headless 호환 보정을 사용한다.
- **AND** 상위 프로세스의 환경은 그대로 유지된다.

#### Scenario: Explicit browser selection

- **GIVEN** `CHROME_PATH`가 설치된 Chrome 실행 파일을 가리킨다.
- **WHEN** 실행기가 원본 Taste 브라우저 검사를 실행한다.
- **THEN** 검사 프로세스는 지정한 Chrome 경로와 Chrome에 전달된 원래 브라우저 인수를 사용한다.

### Requirement: Preserve evaluation and source

실행기는 원본 검사 결과와 숫자 종료 코드를 그대로 반환해야 한다(MUST).
검사에는 기존 Taste의 검사 기준과 설정을 적용해야 한다(MUST).
검사를 실행하는 동안 원본 플러그인과 캐시, 검사 대상 페이지, 프로젝트의 kit 파일 및 repo-governance를 보존해야 한다(MUST).

#### Scenario: A page has design findings

- **GIVEN** 브라우저가 시작됐고 검사 대상 페이지에 원본 게이트가 탐지하는 문제가 있다.
- **WHEN** 원본 게이트가 실패 결과와 종료 코드를 반환한다.
- **THEN** 실행기는 원본 실패 판정, 발견 사항과 종료 코드를 전달한다.

#### Scenario: 검사 중단

- **GIVEN** 실행 중인 원본 검사에 정리 핸들러가 등록되어 있다.
- **WHEN** Windows 실행기가 중단 신호를 받는다.
- **THEN** 실행기는 원본 검사의 정리 핸들러에 중단 신호를 전달한다.
- **AND** 원본 검사 프로세스가 10초 안에 종료되지 않으면 실행기가 시작한 프로세스 계열만 종료한다.
