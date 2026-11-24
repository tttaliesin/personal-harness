# 워커 worktree 배정 설계

## Context

Desktop 어댑터는 현재 모든 새 워커를 `local`에서 시작한다.
`assign-controller-per-run`은 같은 어댑터와 실행 기록을 사용하며, 실행 소유권과 완료 채팅 보관을 변경한다.

## Goals / Non-Goals

컨트롤러는 준비한 브랜치와 시작 커밋을 워커 실행에 전달한다.
워커 채팅의 보관 권한과 상태는 `assign-controller-per-run`에서 관리한다.
Git 정리는 저장소 규칙과 실제 머지 결과를 근거로 별도로 판단한다.

## Decisions

### 저장소 규칙은 컨트롤러에서 적용한다

컨트롤러는 저장소 지침을 읽고 브랜치와 시작점을 정한다.
`repo-branch`가 있는 경우 브랜치 기준을 정할 때 참고할 수 있다.
Orchestrator CLI에는 확정한 `worktree: { branchName, startCommit }`만 넘긴다.
이 구조는 명시적 Git 배정과 기존 로컬 실행을 같은 API에서 지원한다.

### 작업 기록으로 워커의 Git 배정을 이어간다

`dispatch`는 선택 입력을 기존 작업과 호스트 동작의 JSON에 저장한다.
같은 `taskId`의 후속 실행은 처음 확정한 배정을 사용한다.
이 방식은 기존 워커 대화 연결과 재실행 규칙을 재사용한다.
Desktop이 새 worktree를 만들 때 `startingState`에 사전에 준비한 브랜치 이름을 보낸다.
시작 커밋은 워커가 초기 체크아웃을 검증할 때 사용한다.
Desktop이 detached HEAD에서 시작할 수 있으므로 워커는 검증한 뒤 해당 로컬 브랜치에 연결한다.
첫 실행 이후에는 작업 커밋이 더해질 수 있으므로 워커는 배정 브랜치와 현재 Git 경로를 대조한다.
컨트롤러는 실제 worktree 경로와 브랜치에서 보고한 변경을 확인한다.

### 채팅 보관 전 Git 작업을 보존한다

Desktop은 채팅을 보관할 때 관리형 worktree를 정리할 수 있다.
컨트롤러는 worktree 워커의 결과를 채택한 뒤 채팅을 유지한다.
보관을 요청할 때는 해당 워커의 현재 Desktop 조회 응답을 `archive`에 전달한다.
CLI는 유휴 상태인 워커의 실제 경로를 등록 저장소에서 배정 브랜치를 체크아웃한 연결 worktree와 대조한다.
배정한 시작 커밋이 현재 브랜치 이력에 있고 스테이징한 변경, 파일 수정과 미추적 파일이 없으면 CLI가 보관 action을 반환한다.
보관을 재요청할 때도 CLI가 같은 검사를 수행한다.
컨트롤러는 Desktop에서 보관을 실행하기 직전에 이 검사를 거친다.
로컬 브랜치 삭제는 머지 결과를 근거로 별도 수행한다. [Codex 관리형 worktree 정리](https://learn.chatgpt.com/docs/environments/git-worktrees#worktree-cleanup)

## Risks / Trade-offs

호스트의 생성 응답은 워커 대화의 식별자를 알려준다.
파일을 쓰는 위치는 워커의 Git 조회와 컨트롤러의 검토에서 확인한다.
시작 전에 브랜치가 움직이면 워커가 수정 전에 멈춘다.

## Migration Plan

기존 작업 기록은 `worktree`를 생략하며 현재 로컬 실행 경로를 사용한다.
