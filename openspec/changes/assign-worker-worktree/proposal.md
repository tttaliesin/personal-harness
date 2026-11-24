# 워커를 작업 브랜치의 worktree에 배정한다

## Why

현재 Desktop 워커 생성은 프로젝트의 로컬 작업 폴더를 사용한다.
같은 저장소의 파일을 동시에 수정하는 작업을 서로 다른 브랜치와 worktree에 배정할 수 있어야 한다.

## What Changes

- `dispatch`가 이미 준비한 로컬 작업 브랜치와 시작 커밋을 선택 입력으로 받는다.
- 새 워커는 지정된 브랜치에서 Desktop worktree를 열고, 첫 수정 전에 실제 Git 작업 위치를 확인한다.
- 후속 실행은 기존 워커와 배정 정보를 이어받는다.

## Capabilities

### New Capabilities

### Modified Capabilities

- `worker-run-lifecycle`: 작업별 worktree 배정, 시작점 확인, 후속 실행에서의 재사용.

## Impact

Worker Orchestrator의 배정 계약과 Desktop 어댑터가 바뀐다.
저장소의 Git 작업 기준에 따라 컨트롤러가 배정 정보를 정한다.
`assign-controller-per-run`은 실행 소유권과 채팅 보관을 계속 담당한다.
