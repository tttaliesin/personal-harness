# pi 연결

Node.js 22.18 이상, Task 3, pi와 모델 인증이 필요하다.
전체 배포 폴더를 유지하고 배포 루트에서 스킬과 extension을 같은 세션에 연결한다.
`제품폴더`는 [도입한 Git 저장소](repository-policy.md#로컬-native-연결)의 경로로 바꾼다.

```sh
task run:pi TARGET="제품폴더"
```

명령은 배포물의 `.pi/extensions/repo-governance.ts`와 `skills/repo-governance`를 전달한다.
공통 스킬이 참조하는 `specs/`·`templates/`를 포함한 배포 루트를 유지한다.
기존 pi 세션과 extension을 사용하며 별도 모델 SDK session을 만들지 않는다.

## 스킬과 callback 확인

작업 에이전트가 공통 스킬·관련 규칙·실제 근거를 읽는지 확인한다.
extension의 지원 tool-call callback은 같은 v3 checker를 호출한다.
실제 지원 입력의 기계 위반·자료 부족·오류를 block 응답으로 변환한다.
미도입 저장소의 지원 변경 호출은 원래 도구를 허용하며 `inspection: "not-adopted"` 판정을 `pi.sendMessage`의 custom message로 전달한다.
메시지 본문에는 검사하지 않은 범위와 선택한 worktree를 포함한 판정 JSON을 유지한다.
`display: true`로 호스트에 표시하며 에이전트의 LLM 문맥에도 포함한다.
`triggerTurn: false`로 새 모델 턴을 시작하지 않으며 실행 중 메시지는 현재 턴의 도구 결과 뒤에 저장한다.
이 동작은 [pi 1.5.2의 공식 메시지 API](https://github.com/earendil-works/pi/blob/v1.5.2/packages/coding-agent/docs/extensions.md#pisendmessagemessage-options)와 해당 버전의 타입·구현으로 확인했다.

같은 cwd와 같은 도입 범위의 연속 미도입 통지는 한 번만 전달한다.
도입 범위 배열의 순서만 달라지면 같은 범위로 취급하며 원래 판정 JSON의 순서는 바꾸지 않는다.
다른 cwd를 검사하거나 확인된 도입 판정·검사 오류를 거친 뒤 미도입 상태로 돌아오면 다시 전달한다.
`session_tree`의 문맥 분기 이동과 `session_compact`의 압축 성공 때 캐시를 초기화하여 다음 지원 변경 호출에서 다시 전달한다.
두 이벤트는 [pi 1.5.2의 공식 세션 이벤트 계약](https://github.com/earendil-works/pi/blob/v1.5.2/packages/coding-agent/docs/extensions.md#session_before_compact--session_compact)에 따른다.
읽기·조회 호출은 통지를 만들거나 도입 상태 변경으로 취급하지 않는다.
호스트의 통지 호출이 동기 오류를 내면 도구 허용을 유지하고 다음 지원 변경 호출에서 다시 시도한다.
callback 함수의 로컬 단위 테스트와 실제 pi 세션의 자동 callback 호출을 구분한다.
미지원·복합·동적 입력을 전체 검사했다고 보고하지 않는다.

## 실제 세션 검증

```sh
task verify:native HARNESS=pi
```

명령은 [실제 연결 수용 절차](native-verification.md)와 필요한 증거를 출력한다.
pi나 모델·API·원격 쓰기를 자동 시작하지 않는다.
실제 세션에서 스킬 사용·지원 도구 호출·block·전후 상태를 함께 관측한다.
기계 통과의 의미 부족 보류와 callback 미연결·실패 한계를 따로 확인한다.
연결 코드와 callback 검증을 실제 pi 검증 완료로 계산하지 않는다.
실제 모델 세션의 상태와 남은 검증은 [README의 검증과 지원 상태](../../../README.md#검증과-지원-상태)에서 확인한다.
