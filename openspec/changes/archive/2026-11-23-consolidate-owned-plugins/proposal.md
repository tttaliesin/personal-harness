# Proposal

## Why

세 자체 플러그인은 각각 개발 저장소와 로컬 설치 번들이 있다.
소스와 패키징을 Personal Harness에서 함께 관리하면 공용 배포본을 같은 체크아웃에서 검증할 수 있다.

## What Changes

- 원본 스레드에서 검증된 소스와 실행에 필요한 공용 파일을 받는다.
- Windows Agent Devkit, Worker Orchestrator, repo-governance의 공용 소스를 공개 GitHub `main`의 각 `packages/<이름>/`에 둔다.
- 각 플러그인의 버전과 패키징·테스트 진입점을 유지한다.
- PC별 경로, 개인·조직별 설정, 제품별 설정과 실행 상태는 해당 환경에 둔다.
- 외부 리소스는 출처와 갱신 정책으로 관리한다.

## Capabilities

### New Capabilities

- `owned-plugin-sources` — 자체 플러그인의 소스 이관과 공용 배포 준비.

### Modified Capabilities

## Impact

이관 대상은 Personal Harness의 작업 트리다.
각 원본은 인수본 준비 동안 읽기 전용으로 다룬다.
기존 Codex 설치와 사용자 권한은 각 PC 프로필에서 관리한다.
이미 게시한 번들의 버전과 SHA-256 고정값을 유지한다.
새 번들 게시와 기존 설치 경로 전환은 별도 작업이다.
