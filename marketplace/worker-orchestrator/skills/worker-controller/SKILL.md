---
name: worker-controller
description: Handle ordinary user project requests and native Codex Desktop worker-orchestrator-event/1 callbacks. Resolve the controller role, delegate to authorized same-project Desktop workers, and independently verify their results.
---

# Codex 워커 컨트롤러

이 스킬은 기존 Codex Desktop 대화 도구와 설치된 로컬 CLI를 연결합니다.
워커 대화 운영 권한은 사용자가 해당 프로젝트와 작업에 대해 직접 위임한 동작으로 한정합니다.
스킬이나 워크플로를 수정하라는 요청은 대화 운영 권한의 근거에서 제외합니다.

현재 읽은 **설치본** `SKILL.md`의 부모 디렉터리가 이 스킬 디렉터리입니다.
설치 루트는 그 스킬 디렉터리에서 **두 단계 위**입니다.
`<설치 루트>/skills/worker-controller/SKILL.md`에서 `dirname(SKILL.md)/../..`를 해석합니다.
SKILL 파일 자체를 기준으로 두 번 dirname을 적용하면 `skills/`가 되므로 사용하지 않습니다.
설치 루트의 `dist/cli.mjs`만 실행합니다.
소스 저장소의 CLI나 builder 디렉터리를 실행 경로로 사용하지 않습니다.

먼저 Node.js 24 이상으로 다음 명령을 실행합니다.

```text
node <설치 루트>/dist/cli.mjs capabilities
```

이 출력은 로컬 명령의 지원 범위입니다.
프로젝트 위임을 사용하기 전에 `supports`에서 `project-operations`를 확인합니다.
이 스킬의 자동 실행 절차에는 `work-spec`, `evaluate`, `project-binding` 지원도 확인합니다.
푸시를 켠 프로젝트에서는 `push-event` 지원도 확인합니다.
현재 대화에 공식 Desktop 도구가 노출되는지도 별도로 확인합니다.
필요한 도구가 없으면 누락된 기능을 알립니다.
원격 endpoint나 새로운 MCP 서버를 만들지 않습니다.

## 현재 대화의 역할 확인

일반 사용자 요청과 Desktop이 실제 전달한 `worker-orchestrator-event/1` 콜백에서 이 스킬을 사용합니다.
턴 시작 시 설치 CLI의 첫 `candidate` 요청에 실제 `projectRoot`와 `includeStatus: true`를 전달합니다.
현재 대화 ID는 CLI가 Codex 실행 환경에서 읽습니다.
`DISCOVERY_REQUIRED`를 받으면 `list_projects`와 현재 호스트의 `list_threads` 기록을 조회합니다.
기록 조회에는 `mode: history`, `source: codex`, `archived: false`를 사용하고 `nextCursor`가 `null`일 때까지 같은 범위에서 페이지를 읽습니다.
조회 원문과 각 페이지의 요청 커서를 같은 `candidate` 입력에 담습니다.
`claim: true`를 전달하면 유일한 최초 후보를 등록하고 기존 등록이 있다면 그 역할을 반환합니다.
`claim`을 생략하면 후보 판정만 확인할 수 있습니다.
등록·페이지 입력 예시는 [사용법](../../docs/usage.md)을 읽습니다.

`decision: controller`를 받으면 반환된 프로젝트와 컨트롤러 식별자를 사용합니다.
컨트롤러 등록은 대화의 역할만 기록합니다.
등록된 컨트롤러로 확인되기 전에는 작업을 `dispatch`하지 않습니다.
`worker`, `not_candidate`, `undetermined`에서는 컨트롤러 명의의 동작을 계획하거나 호출하지 않습니다.

## 컨트롤러가 직접 수행하는 작업

컨트롤러의 직접 수행 범위는 다음 항목으로 한정합니다.

- 역할과 권한을 확인하고, 필요한 결정을 사용자에게 요청합니다.
- 배정을 계획하고, 관련 워커를 선택하는 데 필요한 내부 상태를 조회합니다.
- 위임 범위에서 워커를 생성하거나 재사용합니다.
- 허가된 워커를 복원하고 후속 요청을 전달합니다.
- 워커를 관찰하고 상태를 기록하며, 권한이 있으면 보관합니다.
- 워커 결과를 독립적으로 확인하고 채택합니다.
- 진행과 결과를 사용자에게 보고합니다.

컨트롤러는 자신의 역할, 권한, 배정 상태를 직접 보고합니다.
독립 검증에서는 워커가 제출한 결과와 근거를 완료 기준에 대조합니다.

이 범위 밖의 사용자 요청은 크기나 읽기 전용 여부에 관계없이 같은 프로젝트의 Desktop 워커에 배정합니다.
파일이나 상태를 변경하지 않는 설명과 조회도 배정 대상입니다.
Git 설정, 조회, 과거 워커 찾기, 검증, 조사가 여기에 포함됩니다.
배정에 필요한 내부 상태는 컨트롤러가 조회합니다.
사용자가 과거 워커 조회 자체를 요청하면 조회와 결과 정리를 워커에 배정합니다.

필요한 권한이나 도구가 없으면 부족한 항목을 사용자에게 보고하고 배정을 보류합니다.
승인과 위임 범위 밖 작업은 사용자 결정으로 남깁니다.

## 프로젝트 위임과 워커 선택

사용자가 프로젝트의 워커 대화 운영을 직접 위임하면 등록된 컨트롤러 대화에서 `project`를 호출합니다.
입력에는 등록된 `projectId`, `projectRoot`, `hostProjectId`, `controller`를 사용합니다.
`authorization`에 `scope: "project"`를 지정합니다.
`createWorkers`, `sendFollowups`, `archiveCompleted`, `restoreWorkers`에는 각각 `true`나 `false`를 명시합니다.
사용자가 이 프로젝트의 이벤트 전달을 직접 위임하면 `pushEvents: true`를 기록합니다.
v0.1.5의 기존 위임에서 생략한 `pushEvents`는 `false`입니다.
옵트인과 Desktop Hooks 확인 절차는 [사용법](../../docs/usage.md#이벤트-전달-켜기)을 따릅니다.
`source`에는 직접 위임을 확인할 수 있는 사용자 발언의 출처와 해당 작업 범위를 기록합니다.
이 위임은 등록된 프로젝트 루트에서 사용자가 허용한 작업과 동작에만 적용합니다.
`projectRoot`는 현재 프로젝트의 Git 작업 범위를 확인하는 데 사용합니다.
`hostProjectId`는 Desktop에 등록된 대화 생성 대상을 식별합니다.
실제 대상은 호스트에서 확인한 현재 등록 컨트롤러 대화의 `projectId`입니다.
Git 작업 경로와 Desktop 소속은 각각 확인합니다.

사용자가 위임을 바꾸면 같은 `project` 명령으로 권한을 갱신합니다.
상시 위임을 철회하면 `authorization`에서 `scope`를 빼고 현재 권한으로 교체합니다.

컨트롤러의 직접 수행 범위 밖 요청이면 등록된 컨트롤러의 `candidate` 응답에서 `project`와 최상위 `tasks` 배열을 사용합니다.
`tasks`가 배열이면 비어 있어도 `status`를 다시 호출하지 않습니다.
구버전 또는 최초 등록 응답에 `tasks` 배열이 없으면 등록된 `projectId`로 `status`를 조회합니다.
`candidate`에서 읽은 상태는 배정 권한이나 워커 예약을 제공하지 않습니다.
`dispatch`는 앞선 조회 결과를 입력으로 받지 않으며, 자체 트랜잭션에서 현재 컨트롤러·권한·워커 상태를 다시 확인합니다.
생성 또는 재사용을 계획하기 전에 [Desktop 프로젝트 동기화](#desktop-프로젝트-동기화)를 수행합니다.
`tasks`의 `taskId`, `prompt`, `result`를 새 요청과 대조해 관련 작업을 찾습니다.
관련 워커가 실행 중이거나 대기 중이면 기존 실행을 유지하고 새 대화를 만들지 않습니다.
관련 작업에 `workerRef`가 있고 새 실행을 시작할 수 있으면 같은 `taskId`와 `reuseOnly: true`로 `dispatch`합니다.
해당 워커가 보관 상태이면 복원 결과를 기록한 뒤 반환된 전달 action을 수행합니다.
관련 워커가 없고 저장된 직접 위임이 생성을 허용하면 새 `taskId`로 `dispatch`를 실행합니다.

## Desktop 프로젝트 동기화

새 워커를 생성하거나 기존 워커를 재사용하기 전에 `list_projects`와 현재 호스트의 활성 대화 이력을 조회하십시오.
`list_threads`에는 `mode: "history"`, `source: "codex"`, `archived: false`를 쓰고 필요하면 다음 페이지에서 현재 호출 대화를 확인하십시오.
호출 대화의 호스트 `projectId`를 프로젝트 목록과 대조하십시오.
등록된 CLI `projectId`, 원문 `projects`, 각 페이지의 `{cursor, result}`를 담은 `threadPages`를 `sync-project`에 넘기십시오.

기존 호스트 대상이 오래됐으면 `sync-project`가 프로젝트 상태와 권한을 보존하며 대상을 갱신합니다.
다른 Desktop 그룹에 남아 있는 과거 `workerRef`는 기록에 남습니다.
[동기화 결과와 워커 선택 기준](../../docs/usage.md#desktop-프로젝트-동기화)에 따라 다른 그룹의 워커를 새 실행의 재사용 후보에서 제외하십시오.
상위 폴더나 워크트리 경로만으로 소속을 추정하지 마십시오.
호스트 소속이 불확실하면 배정을 보류하십시오.
프로젝트 없는 대화로 대체하지 마십시오.

## 작업 지시와 검증

등록된 컨트롤러는 작은 작업과 읽기 전용 작업을 포함한 모든 일반 프로젝트 자연어 요청에서 목표, 기존 제약, 되돌릴 수 있는 가정과 검증 가능한 완료 기준을 정합니다.
[컨트롤러 워크플로](../../workflows/controller.md)에 따라 계획을 세우고 실제 근거를 만들 워커를 배정하십시오.
`dispatch`에는 프롬프트와 프로필 외에 `workSpec`의 `goal`, `constraints`, `completionCriteria`를 전달하십시오.
프롬프트나 CLI가 덧붙인 작업 명세에 각 완료 기준의 ID를 포함하십시오.
기존 위임과 되돌릴 수 있는 가정으로 처리할 수 있으면 바로 진행하십시오.
목표나 제약을 실질적으로 바꿀 결정, 추가 권한·비용·파괴적 작업의 승인 또는 도구와 워커가 얻을 수 없는 필수 정보가 있을 때만 사용자에게 요청하십시오.
정확한 입력과 기록 예시는 [사용법](../../docs/usage.md)을 읽습니다.

대상 호스트의 공개 도구 메타데이터에서 지원이 확인된 모델과 thinking 조합을 선택합니다.
선택을 위임받았고 둘 다 사용할 수 있다면 일반 작업에는 `gpt-6.2-sol`을 우선 고려하고, 복잡한 종합 판단이나 어려운 원인 조사에는 `gpt-6.2-astra`를 고려합니다.
선호 모델을 사용할 수 없으면 사용자의 조건을 충족하는 확인된 후보를 선택합니다.
사용자가 요구한 모델이나 강도를 바꿔야 하는 경우는 사용자 결정으로 남깁니다.
같은 모델에서 초기값보다 높은 강도 중 지원과 비용 범위를 확인한 단계만 `workSpec.reasoningEscalations`에 오름차순으로 전달합니다.
강도가 고정됐거나 허용된 상승 단계가 없으면 해당 필드를 생략합니다.

| CLI action 또는 관찰 | 공식 호스트 도구 |
| --- | --- |
| `create` | `mcp__codex_app.create_thread` |
| `send` | `mcp__codex_app.send_message_to_thread` |
| 이벤트 원문 확인 | `mcp__codex_app.read_thread` |
| `archive` | `mcp__codex_app.set_thread_archived`의 보관 동작 |
| `unarchive` | `mcp__codex_app.set_thread_archived`의 복원 동작 |

실제 도구 이름과 입력은 현재 제공된 도구 메타데이터를 따릅니다.
도구 이름의 표기는 Desktop의 namespace에 따라 달라질 수 있습니다.
`create_thread`는 사용자가 직접 부여한 생성 허가가 현재 작업을 포함할 때 호출합니다.
저장된 프로젝트 범위의 상시 생성 허가가 적용되면 일반 요청에도 그 허가를 사용합니다.
호스트 도구 정책과 필요한 사용자 승인은 각 호출에 적용합니다.
생성 action의 `hostCall.arguments.target.projectId`가 확인한 컨트롤러의 호스트 `projectId`와 일치할 때만 호출합니다.
일시적인 subagent 도구로 대체하지 않습니다.

`send_message_to_thread`는 등록된 대상 워커에 대한 사용자의 직접 허가를 확인한 경우에 호출합니다.
전달, 보관, 복원에는 `workerRef`의 `threadId`와 `hostId`로 대상을 지정합니다.
현재 위임 기록이 대상과 동작을 포함하면 같은 허가를 다시 묻지 않습니다.
필요한 권한이 빠져 있으면 그 동작과 대상만 사용자에게 확인합니다.

먼저 CLI가 반환한 `action.id`를 보존합니다.
해당 동작을 현재 위임과 호스트 계약에 대조한 뒤 호스트 도구를 한 번 호출합니다.
마지막으로 실제 응답을 `record`에 `hostResult` 또는 계약에 맞는 `receipt`로 기록합니다.
`record`가 새 action을 반환하면 새 ID를 사용해 다음 호스트 작업을 수행합니다.
계획만으로 호스트 성공을 기록하지 않습니다.
생성 결과를 알 수 없으면 `outcome: unknown`으로 남깁니다.
실제 생성 여부를 확인하기 전에는 생성을 다시 보내지 않습니다.
호스트가 생성 시작 전에 요청을 확정 거절했으면 같은 action의 `outcome: rejected`와 실제 근거를 기록합니다.
거절이 기록되면 같은 작업에 새 `requestId`로 수정된 요청을 계획할 수 있습니다.
기록 응답을 받지 못했으면 같은 `action.id`와 원문 응답을 `record`에 다시 전달합니다.

워커 프롬프트에는 `action.runId`와 [워커 스킬](../worker-executor/SKILL.md)의 설치 경로를 전달합니다.
프롬프트에는 프로젝트와 파일 소유 범위도 전달합니다.
요청한 모델과 thinking은 요청값으로만 보고합니다.
호스트 증거가 없으면 실제 적용 프로필은 미확인으로 남깁니다.

### 이벤트 처리와 턴 종료

푸시 기능을 켠 프로젝트는 [이벤트 처리 절차](../../workflows/controller.md#이벤트-처리)를 따릅니다.
신규 요청을 독립 작업으로 나눌 수 있으면 서로 다른 `taskId`와 겹치지 않는 파일 소유 범위를 배정하십시오.
독립 작업의 `dispatch → hostCall → record`를 병렬로 진행하십시오.
각 작업 안에서는 반환된 action과 실제 응답의 순서를 지키십시오.
등록된 컨트롤러는 턴 시작과 종료 직전에 `push-inbox`로 미처리 사건을 확인합니다.
Desktop의 네이티브 `codex_delegation`에서 실제 `source_thread_id`를 얻은 때만 워커 ID와 marker를 대조해 `notice`를 전달하십시오.
각 사건을 독립 처리하고 현재 워커 턴의 원문만 `push-observe`에 제출하십시오.
`ready`의 평가 또는 승인 상태 표시가 끝나면 `push-ack`로 처리 완료를 기록하십시오.
실패한 조회나 아직 실행 중인 워커의 결과는 보류하십시오.
현재 처리할 수 있는 작업을 끝내면 워커 결과를 기다리지 않고 턴을 종료하십시오.
정상 이벤트 경로에서 공유 데몬, `wait_threads`, 직접 `observe`를 사용하지 마십시오.
푸시 위임이 없는 프로젝트의 수동 관찰은 [기존 관찰 절차](../../docs/usage.md#기존-수동-관찰)를 따릅니다.

### 기준 평가와 후속 실행

현재 실행의 원문 결과와 실제 근거를 각 완료 기준에 대조하십시오.
워커의 `passed`는 자체 검증 보고로 취급하십시오.
모든 기준의 상태, 근거와 판단 이유를 `evaluate.checks`에 기록하십시오.
컨트롤러가 직접 확인한 근거를 별도로 참조하십시오.
고정 제약이 하나라도 있으면 `constraintReview`도 포함하십시오.
관찰한 종료 결과의 이벤트 ID를 `resultEventId`로 전달하십시오.

- `complete`이면 결과와 근거를 보고하십시오.
- `retry`이면 동일 워커의 상승 강도 새 실행을 위한 `hostCall`을 현재 위임과 호스트 정책에 대조하십시오.
  허가에 포함되면 호스트 호출을 수행하십시오.
  실제 응답을 반환된 정확한 `action.id`로 기록하십시오.
  새 실행의 이벤트를 처리할 때 새 근거로 평가를 반복하십시오.
- `needs_user`이면 실제로 사용자 결정이 필요한 질문을 전달하십시오.
- `blocked`이면 원인과 허용된 복구 동작을 확인하십시오.
  허용된 다음 동작이 없으면 막힌 항목과 원인을 보고하십시오.

후속 작업이 있으면 `keepWorker: true`를 보내거나 필드를 생략해 워커를 유지하십시오.
후속 작업이 없고 보관을 위임받았으면 `evaluate`에 `keepWorker: false`를 보내십시오.
자동 보관에는 `authorization.scope: "project"`와 `archiveCompleted: true`가 모두 필요합니다.
`complete`에 보관 action이 있으면 현재 권한을 확인한 뒤 보관하십시오.
실제 응답을 같은 `action.id`로 기록하십시오.
승인, 입력 대기, 미확정 호스트 동작에 기존 관찰과 복구 절차를 적용하십시오.

`workSpec`을 생략한 기존 CLI 흐름은 `verify`와 `accept`를 계속 사용할 수 있습니다.
