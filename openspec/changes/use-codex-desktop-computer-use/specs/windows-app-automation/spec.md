# Spec Delta

## Purpose

Windows 앱 조작이 필요한 작업에서 Codex Desktop의 공식 도구를 선택한다.
공통 설치기는 별도의 데스크톱 조작 CLI를 배포하지 않는다.

## ADDED Requirements

### Requirement: Task-based Windows app automation

공통 지침은 Windows 앱 화면이나 GUI 입력이 필요한 작업에서 공식 Computer Use를 자율적으로 선택해야 한다(MUST).

#### Scenario: Windows 앱의 GUI 확인 요청

- **WHEN** 사용자가 스킬 이름 없이 Windows 앱의 화면 확인이나 입력을 요청한다.
- **THEN** Codex는 공식 Computer Use를 선택한다.

#### Scenario: 파일 또는 터미널에서 처리할 수 있는 작업

- **WHEN** Windows 앱의 화면이나 입력 없이 작업을 끝낼 수 있다.
- **THEN** Codex는 작업에 맞는 파일, CLI 또는 구조화된 도구를 선택한다.

### Requirement: Install without the retired CLI

설치기와 적용 계획은 `agent-desktop` 실행 파일이나 스킬에 의존해서는 안 된다(MUST NOT).

#### Scenario: 기존 설정이 있는 프로필 적용

- **WHEN** 기존 프로필에 예전 공통 하네스의 데스크톱 스킬 선택 항목이 남아 있다.
- **THEN** 적용 계획의 설정에서 해당 항목을 제거한다.
- **AND** 예전 하네스가 남긴 `computer-use` 비활성 항목도 제거한다.
- **AND** 기존 앱별 권한과 다른 플러그인 설정을 보존한다.
