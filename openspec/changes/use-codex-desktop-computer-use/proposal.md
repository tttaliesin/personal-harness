# Proposal

## Why

Codex Desktop은 Windows 앱 화면을 직접 읽고 조작할 수 있다.
현재 공통 하네스는 같은 작업을 위해 별도 CLI를 설치하고, 이를 적용의 필수 조건으로 검사한다.

## What Changes

- Windows 앱의 화면이나 입력이 필요한 작업에는 Codex Desktop의 공식 Computer Use를 자율적으로 선택한다.
- 설치기와 갱신 경로에서 `agent-desktop` 실행 파일, 배포 캐시, 스킬을 공통 의존성에서 제거한다.
- Homelab과 Roylabs의 기존 설치 파일과 선택 설정을 정리한다.

## Capabilities

### New Capabilities

- `windows-app-automation` — Codex Desktop의 Windows 앱 조작 도구 선택과 공통 설치 범위.

### Modified Capabilities

## Impact

공통 설정, 개발 지침, 설치기와 두 PC의 기존 Windows 앱 조작 설정을 바꾼다.
기존 로컬 플러그인 등록과 앱 권한은 보존한다.
