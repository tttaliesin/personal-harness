# 검증 방법과 증거

검증은 실제 수행한 대상과 방법에 한정한다.
원문 사례의 보존·기계 실행·작업 에이전트 판단·native 차단은 서로 다른 증거다.
이 문서는 검증 명령과 증거 입력의 실행 계약을 정의한다.
저장소 문서에는 현재 지원 범위·미검증 연결·재현 방법을 유지한다.
릴리스별 결과·실제 세션·원격 작업·실행별 보류 항목은 저장소 밖의 협업/검증 공간에 보관한다.
대상 리비전과 bundle 식별값을 해당 증거에 연결하고 PR에는 검토에 필요한 요약을 남긴다.
누적 결과 기록과 원시 실행 자료를 제품 원본이나 실행 배포물에 편입하지 않는다.
결과 기록을 추가할 때는 같은 실행 리소스와 제품 설정으로 검사를 계속한다.
실행 규칙·검사기·연결·검증 계약이 바뀌면 새 bundle의 식별값과 실제 동작을 다시 확인한다.

## 검증 명령

| 명령 | 수행하는 일 | 증명하지 않는 일 |
|---|---|---|
| `task verify:coverage` | 소스 체크아웃에서 상세안 163개와 T/A/FI/E 57개의 ID·조건·기대 결과와 fixture 연결을 확인 | 사례의 실행 성공·의미 판단·host 차단 |
| `task verify:mechanical` | 소스 체크아웃의 fixture를 격리된 임시 저장소에서 일곱 종류의 실제 checker CLI로 실행 | 상세안 전체 의미 판정·실제 host 세션 |
| `task test` | 소스 체크아웃에서 검사기·실제 파일/Git 후보·프로토콜·배포 등의 동작 테스트 | 자동 모델 실행·실제 세 하네스 통합 |
| `task verify:native HARNESS=codex` | Codex Desktop의 실제 절차·필요한 증거 안내 | Desktop 실행 또는 검증 완료 |
| `task verify:native HARNESS=claude-code` | Claude Code의 실제 절차·필요한 증거 안내 | Claude 실행 또는 검증 완료 |
| `task verify:native HARNESS=pi` | pi의 실제 절차·필요한 증거 안내 | pi 실행 또는 검증 완료 |

일반 검증 명령은 모델·API·GitHub 쓰기를 자동 시작하지 않는다.
`tests/`와 실행 fixture는 소스 체크아웃에서 사용한다.
소스 전용 개발 명령은 테스트 자료가 없으면 소스 체크아웃이 필요하다고 알리며 0개 테스트 통과로 끝내지 않는다.
기계 fixture는 임시 저장소에 테스트 자료를 준비한다.
checker 전후의 실제 파일·Git 상태를 대조하고 사용자 저장소는 수정하지 않는다.

## 목록과 실행

사례 원문은 `specs/` 일곱 상세안의 163개와 `SPEC.md`의 T/A/FI/E 57개 표다.
`scripts/cases.mjs`가 해당 표에서 ID·조건·기대 결과와 현재 위치를 읽는다.
줄 번호·원문 행·조건·기대 결과를 별도 JSON 원본으로 복제하지 않는다.
빈 줄 이동으로 사례를 바꾸었다고 판정하지 않으며 누락·중복·비어 있는 필수 내용은 거절한다.
모든 사례의 의미 기대는 작업 에이전트의 실제 판단 증거가 필요하다.
`tests/cases/mechanical.json`에는 재현 가능한 기계 fixture와 해당 원문 사례 ID만 유지한다.
fixture가 통과해도 연결한 원문 사례 전체가 통과한 것은 아니다.
목록 수·정규식 일치·문서의 판정 단어를 실행 횟수로 합산하지 않는다.

## Native 증거 입력

실제 [세션 절차](native-verification.md)를 수행하고 실행 기록은 제품 원본 밖에 보관한다.
기록이 있으면 다음 명령으로 그 파일과 첨부 자료의 일치 여부를 검사할 수 있다.

```sh
node scripts/verify.mjs native --harness codex --evidence path/to/evidence.json
```

```json
{
  "schemaVersion": 1,
  "harness": "codex",
  "hostVersion": "<관측한 실제 버전>",
  "surface": "desktop",
  "sessionId": "<실제 세션 식별>",
  "bundleSha256": "<검증한 manifest 실제 바이트의 SHA-256>",
  "observations": [
    {
      "caseIds": ["E1"],
      "kind": "skill-use",
      "note": "<읽은 규칙·실제 근거·관측한 결과>",
      "artifact": {"path": "session-log.txt", "sha256": "<실제 첨부 바이트의 SHA-256>"}
    }
  ]
}
```

`harness`는 `codex`, `claude-code`, `pi` 중 하나다.
Codex의 `surface`는 `desktop`이며 다른 둘은 `cli`다.
`kind`는 `skill-use`, `mechanical-rejection`, `semantic-hold`, `host-limit` 중 하나다.
각 기록은 실제 사례 ID·세션·관측 내용과 첨부 자료를 연결한다.
첨부 상대 경로는 evidence 파일을 기준으로 읽는다.
기계 검사는 현재 bundle·파일 hash·필드·사례 연결의 일치만 확인한다.
파일과 hash가 맞는다고 실제 host 실행의 진실성이나 사례 전체의 합격을 발급하지 않는다.
실제 세션 기록에서 자동 호출·거절·보류·전후 결과를 직접 읽고 판정해야 한다.
증거가 없으면 `unverified`와 종료 코드 3을 반환한다.
불완전한 증거는 종료 코드 3, 잘못된 입력과 hash 불일치는 1이다.
첨부 일치가 확인돼도 결과는 `evidence-consistent`이며 `nativeVerified`는 `false`다.
이 상태는 실제 연결 검증 완료와 별개다.
