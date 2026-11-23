# Spec Delta

## Purpose

실제 변경 대상의 로컬 도입 상태를 찾아 공통 규칙과 해당 제품의 계약을 결정한다.
같은 clone의 기본 도입과 worktree별 설정을 함께 지원하고, 선택한 입력의 오류를 호출자에게 알린다.

## ADDED Requirements

### Requirement: Record default adoption for the local Git clone

`task adopt TARGET=…`는 대상이 실제 Git worktree이며 사용 중인 배포물이 유효한지 확인한 뒤 Git 공통 메타데이터에 clone 도입을 기록해야 한다(MUST).

#### Scenario: 연결된 worktree에서 기본 도입

- **WHEN** 같은 clone에 속한 연결된 worktree에서 유효한 배포물로 처음 도입한다.
- **THEN** 도입 명령은 Git 공통 디렉터리의 `repo-governance/clone-adoption.json`에 `schemaVersion: 2`, `mode: "enforce"`를 기록한다.
- **AND** 같은 clone의 다른 worktree는 개별 입력이 없으면 공통 규칙과 빈 출력 경계를 사용한다.
- **AND** 다른 Git clone의 도입 상태는 그 clone의 메타데이터에서 결정한다.

#### Scenario: 같은 대상에 다시 도입

- **WHEN** 대상 clone에 유효한 도입 기록이 이미 있다.
- **THEN** 같은 명령은 `changed: false`로 성공을 보고하고 기존 메타데이터를 보존한다.
- **AND** 도입 결과는 `scope: "local-clone"`, `execution: "not-observed"`를 보고한다.

### Requirement: Resolve automatic governance against the actual worktree

연결부는 확인된 작업 대상별로 worktree 도입 기록, 기존 worktree 제품 입력, clone 도입 기록 순으로 적용 범위를 확인해야 한다(MUST).

#### Scenario: 같은 clone의 worktree마다 설정이 다름

- **WHEN** 도입한 clone의 한 worktree에 개별 기록이나 기존 제품 입력이 있고 다른 worktree에는 없다.
- **THEN** 연결부는 개별 입력이 있는 worktree에 그 제품 계약을 적용한다.
- **AND** 개별 입력이 없는 동료 worktree에는 공통 기본값을 적용한다.
- **AND** 명령이 실제 작업 위치를 변경하면 원래 세션 위치 대신 확인한 대상 worktree에서 입력을 찾는다.

#### Scenario: 유효한 도입 기록과 기존 제품 입력이 모두 없음

- **WHEN** 지원 변경의 실제 로컬 대상에서 도입 기록과 개별 제품 입력을 모두 찾지 못했다.
- **THEN** 연결부는 `not-adopted`를 보고하고 해당 범위의 자동 검사를 적용하지 않는다.

#### Scenario: 선택된 worktree 계약이 손상됐거나 빠짐

- **WHEN** 선택된 도입 기록이 손상됐거나, worktree 도입 기록은 유효하지만 함께 사용할 제품 입력을 읽을 수 없다.
- **THEN** 연결부는 해당 변경을 보류하고 도입 오류 또는 검사 입력 오류를 보고한다.
- **AND** 제품 입력을 가리키는 끊어진 링크는 손상된 입력으로 취급한다.

### Requirement: Use explicit inspection input as the selected contract

직접 검사 또는 명시적인 호스트 검사 호출은 지정한 배포물과 제품 입력을 그 호출에 적용해야 한다(MUST).
제품 입력을 선택한 뒤에는 해당 입력의 유효성을 검사해야 한다(MUST).

#### Scenario: 호스트 검사에 외부 제품 입력을 명시

- **WHEN** 명시적 제품 경로와 세션에 설정한 제품 경로를 함께 제공한다.
- **THEN** 연결부는 명시적 경로를 선택한다.
- **AND** 선택한 자료가 누락되거나 잘못된 경우 그 오류를 보고하고 다른 제품 입력으로 바꾸지 않는다.

#### Scenario: 사용자가 도입 전 직접 검사를 요청

- **WHEN** 호출자가 직접 검사에 배포물만 제공하고 해당 clone에는 도입 기록이 없다.
- **THEN** 검사기는 명시한 자료를 공통 기본값으로 검사한다.
- **AND** 호출자는 결과에서 실제 사용한 자료를 확인할 수 있다.

### Requirement: Bind validated product input to one worktree

`task bind:product`는 지원하는 UTF-8 제품 입력을 확인한 뒤 선택한 worktree의 Git 메타데이터에 제품 파일과 `schemaVersion: 1` 도입 기록을 연결해야 한다(MUST).

#### Scenario: 기존 제품 파일의 바이트와 새 입력이 다름

- **WHEN** 호출자가 기존 제품 입력과 다른 파일을 선택한다.
- **THEN** 명령은 새 외부 백업 파일을 지정하지 않은 요청에 `needs-context`를 반환하며 기존 파일을 보존한다.
- **AND** 유효한 새 백업 경로를 지정하면 기존 바이트를 보관한 뒤 새 제품 입력을 연결한다.

#### Scenario: 유효한 도입 기록에 누락된 제품 입력을 복구

- **WHEN** 도입 기록은 유효하고, 제품 입력이 누락된 worktree에 검증한 제품 파일을 연결한다.
- **THEN** 명령은 기존 도입 기록을 사용하면서 해당 worktree에 제품 입력을 복구한다.

### Requirement: Validate the product schema while retaining compatible local contracts

공통 배포물은 제품 입력의 `schemaVersion: 1`과 지원 필드를 해석해야 한다(MUST).
호환 가능한 이전 제품 입력의 `bundle.version`, `bundle.sha256`, `readmeProfile`도 읽을 수 있어야 한다(MUST).

#### Scenario: 이전 bundle 식별자가 든 설정으로 호환 갱신

- **WHEN** 현재 배포물의 무결성이 유효하고 이전 worktree 설정에 올바른 형식의 기존 bundle 식별자가 있다.
- **THEN** 연결부는 새 배포물의 공통 규칙과 기존의 제품별 값을 함께 사용한다.
- **AND** 기존 기록과 제품 파일은 설치 갱신 후에도 도입의 근거로 유효하다.

#### Scenario: 제품이 고유 기준과 좁은 예외를 선언

- **WHEN** 제품 입력이 `sources`, `baseRef`, `outputBoundaries` 또는 지원하는 예외를 선언한다.
- **THEN** 검사 계약은 필드 형식과 값의 범위를 확인한다.
- **AND** 출력 경계는 저장소 상대 `path`, `purpose`, `lifetime`을 요구한다.
- **AND** 이름·커밋·브랜치 예외는 각각 정확한 이름, `upstream-area`와 실제 영역 목록, 정확한 접두어를 사용한다.
- **AND** 예외 출처에 필요한 `source`, `scope`, `expires`를 요구하고 내용의 효력은 에이전트가 현재 근거로 확인한다.

### Requirement: Verify the selected common distribution before relying on it

설치·도입과 직접 검사는 각 진입점이 사용하는 배포 manifest에서 필요한 경로·버전·SHA-256을 확인해야 한다(MUST).

#### Scenario: 같은 버전에서 필수 배포 파일이 변경됨

- **WHEN** 현재 manifest에 기록된 필수 리소스의 내용이 달라졌거나 필요한 리소스가 빠졌다.
- **THEN** 해당 설치·도입이나 검사는 무결성 문제를 드러내고 그 자료의 성공 판정을 보류한다.
- **AND** 직접 검사는 실행 중인 검사기와 따로 선택한 bundle의 검사기 모듈이 일치하는지도 확인한다.
