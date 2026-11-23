# Proposal

## Why

Worker Orchestrator의 원본 계획은 기존 Codex Desktop 입력창에서 프로젝트별 워커 대화를 맡기고, 컨트롤러가 실행과 검증 후 보관을 관리하는 흐름을 정의했다.
이관된 사용법, 공통 선택 지침, 구현에 나뉜 동작을 한 기준으로 확인할 수 있도록 다음 변경 전에 OpenSpec 규격을 만든다.

## What Changes

- 원본 설계 기록과 공개 배포본 `0.1.6`을 근거로 사용자와 연동 도구가 관찰할 수 있는 동작을 규격화한다.
- 컨트롤러 역할 등록, 사용자 위임, 실제 Desktop 호출을 각각의 조건과 상태로 정의한다.
- 공개 CLI 명령, 워커 실행과 검증, 수동 관찰과 이벤트 전달, 재사용·복원·보관의 경계를 시나리오로 기록한다.
- 위임 전에 후보 조회를 시작할 시점과 짧은 요청의 배정 기준은 결정할 항목으로 기록한다.

## Capabilities

### New Capabilities

- `worker-project-control`: 프로젝트 식별, 컨트롤러 탐색과 등록, 운영 위임, Desktop 프로젝트 동기화와 상태 저장소의 범위.
- `worker-run-lifecycle`: 실행 예약, 호스트 동작, 응답 기록, 대기와 불명확한 응답에서의 복구, 워커 재사용·복원·보관.
- `worker-result-evaluation`: 작업 명세와 실행별 결과 계약, 컨트롤러의 독립 검증, CLI의 완료·재시도·대기·차단 판정.
- `worker-event-delivery`: 수동 관찰, 프로젝트별 푸시 위임, 승인과 결과 저널, 콜백 출처 검증과 중복 처리 제어.

### Modified Capabilities

## Impact

- `packages/worker-orchestrator/`의 소스, 스킬, 워크플로, 공개 CLI와 테스트에 적용할 동작 기준을 제공한다.
- 이 변경의 산출물은 기존 OpenSpec 루트에 기록하는 규격과 설계 근거다. 공개 배포본 `0.1.6`과 원본 이관 커밋을 기준으로 삼는다.
