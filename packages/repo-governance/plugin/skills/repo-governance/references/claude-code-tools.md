# Claude Code 연결

Node.js 22.18 이상, Task 3, Claude Code와 모델 인증이 필요하다.
전체 배포 폴더를 유지하고 배포 루트에서 시작한다.
`제품폴더`는 [도입한 Git 저장소](repository-policy.md#로컬-native-연결)의 경로로 바꾼다.

```sh
task run:claude TARGET="제품폴더"
```

이 명령은 `claude --plugin-dir`로 배포 루트를 전달한다.
설치 루트의 `specs/`·`templates/`를 포함해 공통 스킬의 실제 참조가 유지돼야 한다.
스킬 폴더만 복사한 상태를 완전한 배포로 보지 않는다.

## 스킬과 hook 확인

새 세션에서 `repo-governance` 스킬을 사용한다.
작업 에이전트가 관련 규칙과 실제 자료를 읽고 권장안을 만드는지 확인한다.
host가 표시하는 플러그인·hook·신뢰 상태를 확인한다.
`.claude-plugin/plugin.json`과 `hooks/claude-code.json`이 연결 경로를 정의한다.
지원하는 `PreToolUse` 입력은 공통 검사 요청으로 변환한다.
수행한 검사의 기계 위반·자료 부족·오류는 host 거절 응답에 연결한다.
직접 hook 프로세스 성공은 실제 host에서 자동 호출됐다는 증거가 아니다.

## 실제 세션 검증

```sh
task verify:native HARNESS=claude-code
```

이 명령은 [실제 연결 수용 절차](native-verification.md)와 필요한 증거를 안내한다.
모델·API·원격 쓰기를 자동 시작하지 않는다.
실제 세션에서 스킬 사용·지원 입력의 자동 호출·원래 작업의 거절을 확인한다.
기계 통과지만 근거가 부족한 사례에서 작업 에이전트가 적용을 보류하는지도 따로 확인한다.
입력 인용문·미지원·복합 입력과 hook 누락·비활성화·timeout의 동작을 기록한다.
연결 코드와 프로토콜 검증을 실제 Claude Code 검증 완료로 계산하지 않는다.
실제 모델 세션의 상태와 남은 검증은 [README의 검증과 지원 상태](../../../README.md#검증과-지원-상태)에서 확인한다.
