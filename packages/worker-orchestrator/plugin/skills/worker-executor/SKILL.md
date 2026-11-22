---
name: worker-executor
description: Execute a scoped worker assignment and return a structured run result when a controller supplies a runId, task, and ownership boundaries in a Codex worker chat.
---

# Codex 워커 실행

컨트롤러가 제공한 `runId`와 작업 범위를 사용합니다.
실행 식별자가 없으면 완료 결과를 만들기 전에 누락 사실을 현재 대화에 알립니다.
허용된 파일과 요청한 검증만 다룹니다.
다른 에이전트의 변경은 보존합니다.

## 워커의 실행 범위

워커는 배정받은 프로젝트와 작업 범위에서 요청한 결과물을 만듭니다.
작업이 작거나 읽기 전용이어도 같은 배정 범위를 적용합니다.
배정에 읽기 전용 Desktop 조회가 포함되면 허용된 도구로 조회합니다.
사용자가 결과를 요청한 과거 워커 조회도 배정 범위에 포함할 수 있습니다.
배정을 계획하거나 관련 워커를 고르는 데 필요한 내부 조회는 컨트롤러가 맡습니다.

워커는 컨트롤러 상태를 변경하지 않습니다.
다른 대화를 생성하거나 복원하거나 보관하지 않습니다.
다른 대화에 후속 요청을 전달하지 않습니다.
권한이나 도구가 부족하면 필요한 항목을 현재 대화에 보고합니다.
승인과 배정 범위 밖 작업은 사용자 결정으로 남깁니다.

설치 루트는 현재 설치본 `SKILL.md`의 부모인 스킬 디렉터리에서 **두 단계 위**입니다.
`<설치 루트>/skills/worker-executor/SKILL.md`에서 `dirname(SKILL.md)/../..`를 해석합니다.
설치 경로 확인이 필요하면 해당 루트의 `dist/cli.mjs`만 사용합니다.
소스 저장소의 CLI에 의존하지 않습니다.
워커에게 컨트롤러의 상태 변경 권한은 주어지지 않습니다.

[공통 워커 절차](../../workflows/worker.md)를 읽습니다.
결과 형식은 [결과 스키마](../../workflows/worker-result.schema.json)를 따릅니다.
작업 지시에 완료 기준 ID가 있으면 `summary`에서 각 ID의 결과를 짧게 보고하십시오.
기준을 충족하지 못했거나 확인하지 못했으면 해당 ID와 이유를 적으십시오.
검증을 실행하지 않았다면 `verification.status`를 `not_run`으로 남깁니다.
출력·파일·호스트 응답으로 확인한 근거만 `evidenceRefs`에 기록합니다.
승인과 답변 대기는 `pendingRequests`에 유지합니다.

마지막 응답은 `runId`, `status`, `summary`, `verification: {status, evidenceRefs}`, `pendingRequests`를 포함하는 JSON 객체로 반환합니다.
현재 실행과 정확히 일치하는 `runId`를 반드시 최상위 필드에 둡니다.
최종 응답의 JSON 앞뒤에 설명 문단을 붙이지 않습니다.
호스트 완료 판정은 이 최상위 `runId`로 현재 실행을 확인합니다.
푸시를 위임받은 실행은 종료 결과를 `push-result`로 먼저 영속화합니다.
반환된 `hostCall`이 이 실행을 배정한 등록 컨트롤러를 가리키면 그 호출을 한 번 실행합니다.
그 직후 저널에 넣은 것과 동일한 최종 JSON으로 턴을 끝냅니다.
푸시 권한이 없거나 부족하면 현재 워커 대화의 최종 JSON으로 결과를 전달합니다.
컨트롤러로 위장하거나 컨트롤러 대신 `record`, `evaluate`, `verify`, `accept`, `archive`를 실행하지 않습니다.
다른 워커의 생성·전달·복원·보관 도구도 호출하지 않습니다.
