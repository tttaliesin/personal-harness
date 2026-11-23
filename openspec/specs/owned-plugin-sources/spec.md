# 자체 플러그인 소스와 공개 파일

## Purpose

자체 플러그인의 소스, 개발 테스트와 실제 설치 파일을 식별할 수 있게 한다.
공개 파일의 버전과 출처는 마켓플레이스가 읽는 배포 경로를 기준으로 검증한다.

## Requirements

### Requirement: Co-locate owned plugin sources and tests

세 자체 플러그인의 유지하는 소스, 개발 테스트와 게시 파일은 각각 `packages/<name>/` 아래에 둬야 한다(MUST).
카탈로그는 해당 플러그인의 설치에 필요한 배포 루트를 가리켜야 한다(MUST).

#### Scenario: 공개 배포 범위 확인

- **WHEN** 사용자가 카탈로그의 배포 경로를 확인한다.
- **THEN** Repo Governance의 설치 원본은 공용 `plugin/`이다.
- **AND** Windows Agent Devkit과 Worker Orchestrator의 설치 원본은 각각 승인된 `release/`이다.
- **AND** 개인·조직 설정, 제품 연결과 실행 상태는 사용 환경에서 관리한다.

### Requirement: Verify release identity and provenance from distributed bytes

공개 버전의 판정은 카탈로그가 가리키는 실제 매니페스트와 파일의 경로 및 바이트를 근거로 해야 한다(MUST).
검증을 마친 Windows Agent Devkit과 Worker Orchestrator의 배포 파일은 저장소 구조 정리 시 바이트를 보존해야 한다(MUST).

#### Scenario: 현재 공개 파일의 버전과 무결성 확인

- **WHEN** 현재 공개 배포본을 검증한다.
- **THEN** Repo Governance `0.2.0`의 배포 파일을 해당 번들 매니페스트와 대조한다.
- **AND** Windows Agent Devkit `0.3.5`와 Worker Orchestrator `0.1.6`의 설치 파일 목록 및 해시를 승인된 배포 기준과 대조한다.
- **AND** Worker Orchestrator의 소스에서 확인한 개발 버전은 `release/`에서 확인한 설치 버전과 별도로 기록한다.

#### Scenario: 새 자체 플러그인 버전 게시

- **WHEN** 자체 플러그인의 새 버전을 게시한다.
- **THEN** 해당 패키지의 배포 절차에 따라 설치 파일을 검증하고 그 버전과 출처를 기록한다.
- **AND** 카탈로그가 가리키는 파일과 매니페스트를 함께 확인한다.

## 근거

[플러그인 이관과 첫 공개 버전](../../../docs/deployment.md#자체-플러그인-소스와-배포본) · [게시 전 검증](../../../docs/deployment.md#새-버전-게시) · [배포 검사](../../../tests/distribution.test.mjs)
