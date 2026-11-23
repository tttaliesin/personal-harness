# Proposal

## Why

Windows Agent Devkit의 원본 설계는 기존 프로젝트 설정을 보존하면서 Windows 개발 도구를 진단하고 사용자가 직접 확인할 명령을 안내한다.
공개 `0.3.5`의 진단 범위와 판정 근거가 스킬·CLI·테스트에 나뉘어 있어, 다음 버전을 변경할 때 비교할 동작 기준을 OpenSpec에 기록한다.

## What Changes

- 원본 설계 커밋과 공개 `0.3.5`를 대조해 CLI 옵션, 출력, 종료 코드와 보고서 계약을 기록한다.
- 프로젝트 선언과 실행 문맥에서 언어 도구 요구를 도출하고, 관찰한 도구와 권장 구성을 비교하는 기준을 명시한다.
- 호스트 수집과 제한된 대체 수집의 동작을 기록하고, 선택 조회와 사용자가 직접 수행할 검증의 경계를 명시한다.
- 기존 작업 실행기의 유지, 신규 도입 제안, 판단 보류를 재현할 선언과 CI 근거를 기록한다.
- 원본 설계와 배포 동작의 차이 및 후속 정책 질문을 설계에 기록한다.

## Capabilities

### New Capabilities

- `windows-diagnostic-cli` — 설치 스킬, 진입점, 옵션, 진단 보고서, 종료 코드와 기존 유지 사유 조회.
- `windows-project-tool-requirements` — 프로젝트 선언 탐색, 실행 문맥, 언어·패키지 도구 요구, 버전 비교와 공식 지원 판정.
- `windows-host-observation` — PowerShell 호스트 수집, 제한된 대체 수집, 실행 파일 검증, WSL·Docker·Process Compose 관찰.
- `windows-task-runner-advice` — 정적 작업 탐지, CI 근거, 실행기 선택과 수동 확인 안내.
- `windows-advanced-diagnostics` — 도구·Git·.NET의 추가 조회와 Codex 설치 목록, IDE, 볼륨 및 GitHub 인증 선택 조회.

### Modified Capabilities

## Impact

OpenSpec은 `packages/windows-agent-devkit/release/`에 설치본으로 제공되는 `0.3.5`의 동작을 기준으로 삼는다.
이 변경의 산출물은 `define-windows-agent-devkit-behavior`의 제안, 설계, 규격과 검증 기록이다.
