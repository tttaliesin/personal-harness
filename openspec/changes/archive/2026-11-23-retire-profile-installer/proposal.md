# Proposal

## Why

이 저장소의 책임을 여러 에이전트에 스킬과 플러그인을 배포하는 일로 줄인다.
PC별 Codex 환경 적용에 쓰던 설치기와 전용 실행 환경을 정리한다.

## What Changes

- **BREAKING** 저장소 전용 `npx` 설치기와 루트 `task install/update` 등 PC 설정을 동기화하던 명령을 제거한다.
- 유지하는 단독 스킬은 루트 `skills/`에서 표준 `skills` CLI로 배포한다.
- 외부 리소스는 `external-resources.toml`에 출처와 갱신 기준을 기록한다.
- 공개 Codex 카탈로그의 세 설치 경로와 배포 버전은 유지한다.
- 루트 검증은 Node.js의 내장 테스트로 공개 패키지 파일을 대조한다.

## Capabilities

### New Capabilities

- `skill-and-plugin-distribution`은 이 저장소에서 유지하는 스킬과 플러그인의 배포 및 검증 경계를 정의한다.

### Modified Capabilities

## Impact

루트 명령, 단독 스킬 소스 경로, 외부 리소스 목록과 개발 문서를 정리한다.
PC별 설정과 이미 설치한 스킬·도구는 각 환경에서 관리한다.
