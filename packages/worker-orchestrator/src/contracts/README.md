# 공통 명령 계약

이 문서는 개발 버전의 명령 계약입니다.

CLI 형식은 `node <설치 루트>/dist/cli.mjs <command> --state-dir <절대 경로> --input <JSON 파일>`입니다.
JSON을 stdin으로 전달할 때는 `--input -`를 사용합니다.
프로젝트를 등록한 뒤에는 모든 작업 상태 변경에 `projectId`를 사용합니다.
CLI는 대화 도구 호출 계획을 출력하고 실제 호스트 호출은 컨트롤러가 수행합니다.

`candidate`는 런타임의 `CODEX_THREAD_ID`와 입력의 `projectRoot`로 현재 대화와 프로젝트를 확인합니다.
연결된 워커의 역할은 `worker`입니다.
근거가 부족하면 `projects`에 공식 `list_projects` 원문을 넣습니다.
`threadPages: [{cursor, result}]`에는 같은 호스트의 첫 이력 페이지부터 현재 대화를 찾은 페이지까지 공식 `list_threads` 응답을 순서대로 넣습니다.
첫 `cursor`는 `null`입니다.
다음 요청의 `cursor`는 직전 응답의 `nextCursor`입니다.
현재 대화와 작업 범위를 확인한 호출에서 재사용 가능한 프로젝트에 참여시키고 `decision: "controller"`를 반환합니다.
응답의 `project`는 현재 호출 대화와 그 대화에 부여한 권한을 보여 줍니다.
`includeStatus: true`이면 같은 응답의 `tasks`에 호출 대화의 작업만 담습니다.
처음 참여한 대화는 모든 권한이 `false`입니다.
기존에 저장한 위임은 원래 허가받은 대화에만 적용합니다.

`project` 입력은 `projectId`, `projectRoot`, `hostProjectId`, `controller: {threadId, hostId}`, `authorization: {createWorkers, sendFollowups, archiveCompleted, restoreWorkers, pushEvents, source}`를 받습니다.
`controller`는 현재 호출 대화의 실제 식별자입니다.
`authorization.scope: "project"`는 직접 확인한 사용자 허가를 같은 대화와 같은 프로젝트의 후속 작업에 적용한다는 뜻입니다.
권한을 변경하는 대화는 자신에게 부여한 범위만 갱신할 수 있습니다.
`dispatch.resultPushAuthorizationSource`는 현재 실행의 종료 결과 전송을 허가한 사용자 메시지의 참조입니다.
CLI는 이 출처를 배정한 대화와 `runId`에 묶고, 첫 결과 발행에 전송 계획을 반환합니다.
`dispatch.archiveAuthorizationSource`는 현재 실행을 검증하고 채택한 뒤 워커를 보관하도록 허가한 사용자 메시지의 참조입니다.
CLI는 이 허가를 해당 실행과 배정한 대화에 묶습니다.

같은 프로젝트의 컨트롤러는 서로 다른 `taskId`의 작업을 독립적으로 배정하고 기록하고 평가할 수 있습니다.
기존 `taskId`는 소유한 대화만 사용할 수 있습니다.
CLI는 새 작업에 소유자를 기록하고 각 새 실행의 `controllerRef`에 배정한 대화를 저장합니다.
다른 대화가 참여해도 기존 작업과 실행은 기존 소유자에게 남습니다.
`controllerRef`가 없는 이전 저장 실행은 종전 프로젝트 컨트롤러에게 속합니다.
`dispatch` 입력은 `projectId`, `taskId`, `requestId`, `prompt`, `profile: {model, thinking}`를 받습니다.
사용자가 전용 worktree 사용을 요청했다면 `worktree: {branchName, startCommit}`을 전달합니다.
`branchName`은 현재 어느 worktree에서도 사용하지 않는 로컬 작업 브랜치입니다.
`startCommit`은 해당 브랜치가 가리키는 전체 Git 커밋 ID입니다.
같은 작업의 후속 실행과 재시도는 저장된 배정을 이어 씁니다.
`reuseOnly: true`이면 CLI는 지정한 `taskId`에 연결된 워커의 재사용만 계획합니다.
이미 연결된 워커가 없으면 `WORKER_NOT_FOUND`를 반환합니다.
`record` 입력은 `projectId`, `taskId`, `actionId`, `outcome`과 `receipt`, `evidenceRef`를 받습니다.
`record`에 Codex 도구의 원문 `hostResult`를 주면 CLI의 호스트 어댑터가 receipt로 변환합니다.
같은 실행에서 동일 action의 확정 결과를 다시 기록하면 기존 상태와 현재 권한 범위의 후속 계획을 반환합니다.
`outcome: rejected`는 호스트가 실행 전에 `create`를 거절했음이 확인됐을 때 증거 참조와 함께 사용합니다.
거절된 실행은 종료되며 같은 작업에 새 `requestId`로 생성 계획을 요청할 수 있습니다.
`observe` 입력은 `projectId`, `taskId`, `runId`, `eventId`, `status`, `evidenceRef`를 받습니다.
Codex의 `wait_threads` 응답은 `hostResult`로 받습니다.
호출 오류, 같은 워커의 호스트 ID 불일치 또는 최종 JSON 해석 실패가 확인되면 읽기 전용 `hostCall`을 반환할 수 있습니다.
조회 결과를 받으면 같은 `hostResult`와 `evidenceRef`에 `readThreadResult`와 `readThreadEvidenceRef`를 추가해 `observe`를 다시 호출합니다.
CLI는 등록된 워커 호스트의 원문에서 현재 `runId`를 확인합니다.
요약에 터미널 턴과 최종 메시지의 ID가 있으면 CLI는 원문 식별자와 대조합니다.
status는 `running`, `waiting_approval`, `waiting_input`, `completed`, `failed`, `unknown`입니다.
대기 시 `waitId` 또는 `waits: [{waitId, kind}]`를 포함합니다.
`kind`는 `approval` 또는 `input`이며 대기 상태는 배열의 첫 항목에 대응합니다.
완료 시 `result: {success, summary}`를 포함합니다.
`resolve` 입력은 `projectId`, `taskId`, `runId`, `waitId`, `evidenceRef`를 받습니다.
`verify` 입력은 `projectId`, `taskId`, `runId`, `status: passed|failed`, `evidenceRefs`를 받습니다.
검증 대상 결과의 `task.result.eventId`를 `resultEventId`로 전달할 수 있습니다.
같은 실행에서 종료 결과가 교체되면 새 결과의 `resultEventId`가 필요합니다.
`accept`와 `archive` 입력은 `projectId`, `taskId`, `runId`를 받습니다.
`accept`에서 `keepWorker`를 생략하거나 `false`를 전달하면 CLI는 검증된 결과를 채택할 때 자동 보관 권한을 확인합니다.
프로젝트 단위 위임이나 현재 실행의 보관 허가가 있으면 보관 계획을 반환합니다.
워커를 유지하려면 `keepWorker: true`를 전달합니다.
worktree 워커는 결과를 채택해도 유지됩니다.
worktree 워커를 보관할 때는 `archive`에 방금 조회한 해당 워커의 `read_thread` 응답을 `readThreadResult`로 전달합니다.
CLI는 유휴 상태인 워커의 실제 경로를 배정 브랜치의 연결 worktree와 대조하고 미커밋 변경을 확인합니다.
다시 요청할 때도 새 응답과 현재 Git 상태를 확인합니다.
채팅을 확인할 수 없으면 `WORKTREE_THREAD_UNVERIFIED`를, Git 상태를 확인할 수 없거나 변경이 남아 있으면 `WORKTREE_NOT_PRESERVED`를 반환합니다.
`status` 입력은 `projectId`와 선택적인 `taskId`를 받습니다.
컨트롤러 대화에서 호출하면 해당 대화가 소유한 작업만 반환합니다.
`capabilities`는 입력이 필요 없습니다.

`push-result`는 워커·실행 식별자와 저장된 실행의 `controllerRef`를 대조합니다.
배정에 `stateDir`가 있으면 워커는 그 값을 `push-result`의 `--state-dir` 인수로 사용합니다.
CLI는 종료 결과를 프로젝트 저널에 먼저 저장한 뒤 저장된 실행 소유자에게 보낼 `hostCall`을 반환합니다.
`push-inbox`, `push-observe`, `push-ack`는 현재 호출 대화가 소유한 실행의 사건에만 적용합니다.
새 관리 승인 훅은 저널에 메타데이터만 기록합니다.
원본 요청은 워커 대화에 남고 배정한 대화는 다음 턴의 `push-inbox`에서 승인 사건을 확인합니다.
훅의 설정과 교체는 [사용법](../../docs/usage.md#이벤트-전달-켜기)을 따릅니다.
`push-config`는 호출 대화에 현재 푸시 권한이 있을 때 공유 승인 훅을 설정하거나 교체합니다.
`remove: true`는 현재 또는 과거에 푸시를 위임받은 대화에만 허용합니다.
다른 대화에 푸시 권한이 남아 있으면 제거를 거부합니다.

반환값의 `action`이 있으면 `id`, `type`, `projectId`, `taskId`, `runId`, `profile`, `prompt`, `workerRef`, `hostProjectId`, `controllerRef`를 포함합니다.
action type은 `create`, `send`, `unarchive`, `archive`입니다.
기록 성공 뒤 다음 행동이 있으면 새 action을 반환합니다.
성공 receipt는 생성 시 `workerRef: {threadId, hostId}`를 포함합니다.
보관과 복원 receipt는 `archived: true|false`와 동일한 `workerRef`를 포함합니다.
실패가 불명확한 호스트 호출은 `outcome: unknown`으로 기록하고 확인 전 재전송하지 않습니다.
복원이 확인됐을 때 후속 전달 권한이 철회된 상태면 복원은 기록하고 전달을 보류합니다.
전달 권한을 다시 확보한 뒤 같은 `dispatch` 입력으로 전달 계획을 받습니다.
