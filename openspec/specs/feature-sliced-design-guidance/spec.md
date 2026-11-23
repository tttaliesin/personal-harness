# Feature-Sliced Design guidance

## Purpose

Feature-Sliced Design(FSD)을 채택한 저장소에서 기존 구조 규칙에 맞춰 파일 배치와 모듈 경계를 검토한다.
아키텍처 검사 도구의 적용 범위는 각 저장소에서 정한다.

## Requirements

### Requirement: FSD 채택에 따른 스킬 선택

공식 `feature-sliced-design` 스킬의 자율 선택은 저장소 지침, 설계 문서 또는 설정으로 FSD 채택이 확인된 경우에 한정해야 한다(MUST).
채택을 확인한 저장소에서 파일 배치, 레이어, 슬라이스, 공개 API 또는 import 경계를 다룰 때 에이전트는 해당 스킬을 선택해야 한다(MUST).
구조 판단은 저장소가 채택한 FSD 버전, 합의한 예외 및 기존 개발 규칙을 따라야 한다(MUST).
FSD 도입, 마이그레이션 및 기존 레이어 제거는 사용자 요청이 허용한 범위에 한정해야 한다(MUST).

#### Scenario: 채택한 FSD 구조에서 공개 API 검토

- **GIVEN** 저장소 지침에 채택한 FSD 버전과 import 규칙이 기록되어 있다.
- **WHEN** 에이전트가 슬라이스 간 import를 검토한다.
- **THEN** 에이전트는 공식 스킬의 관련 참조를 읽고 저장소의 공개 API와 import 규칙을 적용한다.

#### Scenario: 폴더 이름만 확인한 저장소의 파일 배치

- **GIVEN** React 프로젝트에 `pages`, `shared` 또는 `features` 폴더가 있고 FSD 채택 근거는 확인되지 않았다.
- **WHEN** 에이전트가 새 파일의 위치를 정한다.
- **THEN** 에이전트는 기존 프로젝트 구조에 따라 파일을 배치한다.

### Requirement: 저장소별 아키텍처 검사

Steiger는 FSD 저장소의 구조 검사기로 다룬다.
ArchUnitNET은 C# 저장소의 아키텍처 테스트 도구로 다룬다.
두 도구의 도입, 버전, 검사 규칙 및 실행 시점은 각 저장소에서 요청하거나 채택한 범위에 한정해야 한다(MUST).
설치, hook 추가 및 필수 검사 지정은 해당 저장소의 요청과 개발 규칙이 허용하는 범위로 한정해야 한다(MUST).

#### Scenario: 스킬 예제에 검사 도구 설치 명령이 있는 경우

- **GIVEN** 저장소가 FSD를 채택했고 요청 범위는 파일 배치 검토다.
- **WHEN** 공식 스킬의 참조에서 Steiger 설치 예제를 확인한다.
- **THEN** 에이전트는 저장소에 적용된 도구와 규칙의 범위에서 배치를 검토한다.

#### Scenario: 이미 채택한 아키텍처 검사 실행

- **GIVEN** 저장소가 Steiger 또는 ArchUnitNET을 채택해 검사 규칙과 실행 명령을 정했다.
- **WHEN** 현재 작업에서 해당 검사가 필요하다.
- **THEN** 에이전트는 저장소에 설정된 버전, 규칙 및 명령을 사용한다.
