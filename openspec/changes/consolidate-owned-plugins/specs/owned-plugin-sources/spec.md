# Spec Delta

## Purpose

Personal Harness의 공개 GitHub `main`에서 세 자체 플러그인의 본체와 공용 배포에 필요한 구현을 관리한다.
PC별 경로, 개인·조직별 설정과 제품별 설정은 해당 환경에 둔다.

## ADDED Requirements

### Requirement: Import complete plugin cores

저장소는 자체 플러그인별 소스, 공용 실행 파일과 참조 자료, 빌드 설정 및 테스트를 제공해야 한다(MUST).

#### Scenario: 검증한 인수본의 이관

- **WHEN** 원본 스레드가 검증한 커밋에서 인수본을 제공한다.
- **THEN** Personal Harness의 `packages/<이름>/`에서 해당 플러그인의 패키징과 테스트를 실행할 수 있다.
- **AND** 플러그인 버전과 출처 커밋을 확인할 수 있다.

#### Scenario: 사용자와 조직별 파일

- **WHEN** 원본 작업 트리에 개인 설정, 제품별 적용 설정, 진단 로그와 실행 상태가 있다.
- **THEN** 본체 이관은 해당 파일을 배포 소스에 포함하지 않는다.

#### Scenario: 상위 Git 작업트리가 번들 파일을 제외하는 경우

- **WHEN** Personal Harness 루트의 Git 제외 규칙이 중첩된 repo-governance의 미추적 번들 파일을 제외한다.
- **THEN** 번들 생성, 검증과 패키징은 해당 파일을 보고하고 실패한다.
