# Windows app automation

## Purpose

화면 확인이나 GUI 입력이 필요한 Windows 앱 작업을 Codex Desktop의 공식 Computer Use로 처리한다.
작업을 끝내는 데 필요한 앱 상호작용을 기준으로 도구를 선택한다.

## Requirements

### Requirement: Task-based Windows app automation

Codex는 Windows 앱의 화면 관찰이나 GUI 입력이 필요한 작업에서 공식 Computer Use를 자율적으로 선택해야 한다(MUST).
파일, 저장소 테스트, CLI 또는 구조화된 도구로 요청을 완료할 수 있으면 해당 수단을 사용해야 한다(MUST).
웹 작업은 대상과 세션에 맞는 기존 브라우저 선택 지침을 따라야 한다(MUST).

#### Scenario: Windows 앱의 GUI 확인 요청

- **WHEN** 사용자가 스킬 이름 없이 Windows 앱의 화면 확인이나 입력을 요청한다.
- **THEN** Codex는 Codex Desktop의 공식 Computer Use를 선택한다.

#### Scenario: 파일 또는 터미널에서 처리할 수 있는 작업

- **WHEN** 파일 읽기, 저장소 테스트, CLI 또는 구조화된 도구로 요청한 결과를 얻을 수 있다.
- **THEN** Codex는 작업에 맞는 해당 수단을 선택한다.
