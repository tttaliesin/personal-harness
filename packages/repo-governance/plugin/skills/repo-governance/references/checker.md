# 읽기 전용 검사 계약

Node.js 22.18 이상과 Git을 사용한다.
기준 원문은 [SPEC 11.2](../../../SPEC.md#112-읽기-전용-검사-계약)다.
검사기는 모델 호출·원격 조회·파일 쓰기·Git 변경을 수행하지 않는다.

## 명령 입력

배포 루트에서 다음 명령에 JSON 한 건을 stdin으로 전달한다.

```sh
node skills/repo-governance/scripts/check.mjs
```

```json
{
  "schemaVersion": 3,
  "operation": "check",
  "check": "name",
  "sources": [{"kind": "text", "text": "product-inventory-api"}],
  "context": {"bundlePath": "./skills/repo-governance/assets/bundle.json"}
}
```

스킬 폴더에서 실행하면 스크립트 경로는 `scripts/check.mjs`, bundle 경로는 `assets/bundle.json`이다.
다른 위치에서 실행하면 설치한 배포물의 절대 경로를 사용한다.
실제 파일·Git 대상을 읽을 때 `context.repository`를 제공한다.

Task에서는 요청 파일을 전달한다.

```sh
task --exit-code check REQUEST=request.json
task demo
```

직접 CLI의 옵션은 `--bundle <path>`, `--repository <path>`, `--product <path>`다.
옵션은 각각 한 번만 지정한다.
JSON context와 CLI에서 같은 입력을 중복 지정하면 값이 같아도 오류다.
`--policy`, 구형 v2 요청, 정의하지 않은 key·operation은 지원하지 않는다.

## 요청 필드

| 필드 | 값 |
|---|---|
| `schemaVersion` | 정수 `3` |
| `operation` | `"check"` |
| `check` | 문자열이며 `name`, `description`, `readme`, `commit-message`, `branch`, `pull-request`, `file-scope` 중 하나 |
| `sources` | 아래 Source 조합에 맞는 배열 |
| `context` | `{repository?:string,bundlePath:string,productPath?:string,baseRef?:string}` |

| Source | 정확한 필드 |
|---|---|
| text | `{kind:"text",text:string}`. `readme`에는 제품 루트 기준 상대 `path`를 지정할 수 있다. |
| file | `{kind:"file",path:string}` |
| index | `{kind:"index"}` |
| revision | `{kind:"revision",revision:string}` |
| pr | `{kind:"pr",number:integer,headOid:string,baseOid:string,title:string,body:string}` |
| pr-create | `{kind:"pr-create",repository:string,headRef:string,baseRef:string,headOid:string,baseOid:string,title:string,body:string,draft:boolean}` |

| 검사 | 허용 Source | 기계 확인 범위 | 작업 에이전트의 남은 판단 |
|---|---|---|---|
| `name` | text 한 개 | 소문자 케밥 케이스와 첫 단어의 대분류 | 첫 분류와 실제 책임의 일치·하위묶음·세 번째 자리의 필수 및 생략 조건·실제 이름 충돌 조회 |
| `description` | text 한 개 | 비어 있지 않은 한 줄과 알려진 자리표시자 | 현재 역할과 기능이 드러나는 한국어 설명 |
| `readme` | text, file 또는 index 한 개 | 문서 구조, 상대 링크와 앵커, 남은 자리표시자 | 독자가 시작하는 데 필요한 조건과 실제 경로 |
| `commit-message` | text 또는 file 한 개 | type·scope·구분자·빈 줄·참조 표기 | 실제 diff와 의미·한국어·영향·참조·정리 예외 |
| `branch` | text 한 개 | 이름 본문·Git ref 유효성·제공한 namespace와 실제 기준 | 작업 목적·기준 선택·기존 이름의 용도·host 필요성 |
| `pull-request` | pr 또는 pr-create 한 개 | 제목, 본문 코드 블록과 자리표시자, 제공된 head/base와 생성 단계 | 실제 원격 대상, diff, 한국어 설명, 검증과 영향 |
| `file-scope` | index/revision 한 개 또는 file 여러 개 | 실제 경로·Git 후보·추적·제외·선언 출력 경계 | 제품 책임·내용·혼합·미분류·보관 위치 |

`name`은 두 단어 이상을 영문 소문자·숫자와 단일 하이픈으로 이은 표기를 확인한다.
표기 위반에는 `name-format`을 반환한다.
허용된 첫 분류는 `product`, `infra`, `deploy`, `shared`, `docs`이며, 표기는 맞지만 첫 분류가 다르면 `name-category`를 반환한다.
예를 들어 `product-order-management-api`의 `order-management`는 제품명 한 자리다.
작업 에이전트는 [K1 상세안](../../../specs/naming.md)과 실제 자료에서 자리의 경계와 의미를 확인한다.
`shared-plugin`처럼 기계 검사를 통과한 후보도 개별 리소스명이 빠지면 작업 에이전트가 위반으로 판정한다.
선언한 플랫폼 예외 이름과 정확히 일치하면 기계 검사를 통과한다.
작업 에이전트는 [외부 계약의 좁은 예외](repository-policy.md#외부-계약의-좁은-예외)에 따라 원문과 대상·범위·효력 및 이름 충돌을 확인한다.

실제 경로·Git 후보를 읽는 검사에는 `context.repository`가 필요하다.
필요한 제품 사실·출력 경계·host namespace는 [제품 입력](repository-policy.md)에서 제공한다.
입력 누락은 성공으로 대체하지 않는다.
`fixup!`·`squash!`·`amend!`의 표기 통과는 임시 예외의 성립을 뜻하지 않는다.
현재 작업 에이전트가 대상 커밋·허용된 작업 범위·정리 계획·최종 메시지를 확인해야 한다.
이 근거의 미확인을 기계 검사기의 의미 승인 필드로 대신하지 않는다.
PR Source는 호출자가 실제 조회한 자료이며 검사기 자체의 원격 조회 증거가 아니다.
pr-create는 아직 번호가 없는 생성 후보다.
`repository`는 GitHub.com의 `owner/repo`, `headRef`와 `baseRef`는 전체 `refs/heads/...` 이름이다.
전체 head/base OID와 boolean `draft`를 명시하며 기존 pr 계약의 필수 번호를 완화하지 않는다.
native 생성 연결은 실제 조회한 원격 refs만 이 Source로 구성한다.
직접 checker에 제공한 OID를 독립적인 원격 조회 증거로 보고하지 않는다.
README text의 `path`를 지정할 때는 `context.repository`에 실제 제품 루트를 제공한다.
검사기는 그 파일이 놓일 디렉터리를 기준으로 상대 링크를 확인한다.
`path`를 생략하면 `context.repository`에 있는 `README.md`를 기준으로 사용한다.
저장된 내용을 확인하려면 `file` Source와 실제 제품 루트를 제공한다.
`index` Source는 변경된 README와 링크 대상을 같은 Git 인덱스에서 읽는다.
위치를 표현할 수 없는 생성 전 후보는 구조를 검사하고 상대 링크의 위치 확인을 보류한다.
Markdown의 블록·코드·주석·참조 링크는 번들에 포함한 `markdown-it` 15.0.3으로 해석한다.
파서의 [MIT 라이선스](../scripts/vendor/markdown-it.LICENSE)를 함께 배포하며 별도 설치는 필요하지 않다.
파서는 구문 구조를 읽으며 설명의 충분성이나 실제 업무 의미를 판단하지 않는다.
코드 fence는 최종 개행 유무와 무관하게 닫힘을 확인한다.
HTML 링크·anchor는 따옴표 없는 유효한 속성도 읽으며 주석·코드·다른 속성의 문자열을 링크로 만들지 않는다.
HTML raw text 문맥은 inline·문단·블록 경계를 넘어 유지하며 실제 종료 태그 뒤에서 링크·제목·anchor 검사를 재개한다.

## Git 비교와 내부 호출

직접 `index` 요청의 기본 비교 대상은 현재 HEAD다.
사용자 diff 설정과 무관하게 submodule 후보도 열거하며 지원하지 않는 blob 유형은 보류한다.
`revision`의 명시적 `baseRef`는 두 revision 사이의 비교 기준이다.
PR workflow는 파일 검사에 별도로 구한 merge-base를 사용하고 PR의 실제 base OID와 구분한다.

연결 코드는 `runCheck(requestText, argv, runtime)`의 내부 선택으로 Git 환경과 index 비교를 전달한다.
`runtime.gitEnvironment`는 해당 호출의 Git 읽기에만 적용되며 전역 `process.env`를 수정하지 않는다.
`runtime.indexComparison`은 `head` 또는 `amend`다.
`amend`는 HEAD의 실제 부모와 교체 index를 비교하며 루트 commit에는 전체 index를 사용한다.
이 runtime은 JSON 승인 필드나 실행 권한이 아니며 실제 명령 입력과 연결의 한계를 기록하는 내부 선택이다.

## 응답

stdout에는 JSON 한 줄을 출력한다.

```json
{
  "schemaVersion": 3,
  "rulesVersion": "0.2.0",
  "check": "name",
  "scope": "mechanical",
  "decision": "pass",
  "observed": [],
  "findings": [],
  "semanticChecks": [
    {
      "ruleId": "K1",
      "question": "후보가 분류와 자리 조건 또는 플랫폼의 검증된 정확한 이름 요구를 충족하며 실제 이름 충돌이 없는가?",
      "requiredEvidence": ["실제 제품·운영·배포물 자료와 관련 저장소", "예외 적용 시 플랫폼 원문과 대상·범위·효력", "후보 이름의 실제 충돌 조회"]
    }
  ]
}
```

위 예시의 `semanticChecks`는 실제 응답 필드의 모양과 의미를 한국어로 보여준다.
실제 응답의 `observed`에는 실제 읽은 대상만 들어간다.
실제 `semanticChecks`에는 검사 종류에 필요한 의미 질문이 남는다.

| 필드 | 항목 형식 |
|---|---|
| `observed` | `{kind:string,target:string,digestOrOid:string}` |
| `findings` | `{ruleId:string,code:string,message:string,target:string}` |
| `semanticChecks` | `{ruleId:string,question:string,requiredEvidence:string[]}` |

| decision | CLI 종료 코드 | 처리 |
|---|---|---|
| `pass` | 0 | 검사한 기계 조건을 충족한다.<br>작업 에이전트는 남은 의미를 직접 확인한다. |
| `violation` | 2 | 확인한 위반을 수정하고 현재 후보를 다시 검사한다. |
| `needs-context` | 3 | 부족한 필수 자료를 확보할 때까지 해당 적용을 보류한다. |
| `error` | 1 | 잘못된 입력·리소스·실행 오류를 해결한 뒤 다시 검사한다. |

실제로 호출된 하네스 훅과 CI는 nonzero를 실패에 연결한다.
host의 누락·비활성화·timeout 동작은 [실제 세션 검증](verification.md)에서 따로 확인한다.

## 대상 식별

텍스트는 UTF-8 원문, 파일은 실제 바이트의 SHA-256으로 식별한다.
Git index 검사는 실제 Git 환경의 `git ls-files --stage -z`와 해당 blob을 읽는다.
repository·worktree·index 경로·경로별 blob OID와 실제 revision OID를 구분한다.
`git write-tree`·stage·commit·ref 변경으로 검사 대상을 만들지 않는다.
관측한 대상·내용·기준이 바뀌면 관련 검사를 다시 한다.
digest는 실행 허가나 변경 경쟁 방지 토큰이 아니다.
