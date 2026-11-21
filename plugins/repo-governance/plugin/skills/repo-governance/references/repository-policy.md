# 기준과 제품 설정

공통 규칙은 배포 루트의 [SPEC](../../../SPEC.md)과 [일곱 상세안](../../../specs/)에서 읽는다.
`assets/policy.json`에는 기계로 확인할 조건을 둔다.
제품에서 다른 값이 필요한 때만 이 문서의 설정을 사용한다.

## Bundle

`assets/bundle.json`은 배포 파일마다 실제 경로와 SHA-256을 기록한다.
설치·갱신 명령은 등록 전에 이 목록과 설치본을 대조한다.
직접 검사기는 전달한 배포물을 사용한다.
파일 누락이나 해시 불일치는 설치본을 다시 확인할 이유다.

기존의 제품 입력에 `bundle.version`과 `bundle.sha256`이 있어도 호환되는 입력으로 읽는다.
설치본의 파일 해시는 해당 설치본의 무결성을 확인하는 값이다.
제품 설정의 지원 여부는 설정 스키마로 판단한다.

## 제품별 최소 입력

기본 도입은 별도 설정 파일 없이 실행한다.
기본 출력 경계는 빈 배열이다.
설정이 필요한 경우 배포 폴더에서 `task show:product`로 예시를 출력한다.
파일로 받으려면 `OUTPUT=제품밖새파일.json`을 지정한다.

| 필드 | 사용할 때 |
| --- | --- |
| `schemaVersion` | 현재 값은 `1`이다. |
| `sources` | 제품이 실제로 유지하는 계약이나 작업 기준의 경로를 추가할 때 쓴다. |
| `baseRef` | 브랜치 작업의 기본 기준을 저장소에서 별도로 정할 때 쓴다. |
| `outputBoundaries` | 저장소 내부에 둘 로컬 출력 경로를 선언한다. 각 항목에는 `path`, `purpose`, `lifetime`을 쓴다. |
| `branchNamespace` | 호스트나 기존 자동화가 소비하는 정확한 접두어를 선언한다. |
| `repositoryNameException` | 플랫폼이 요구하는 정확한 저장소 이름을 선언한다. |
| `commitConvention` | 외부 기여 대상이 사용하는 `upstream-area`와 실제 area 목록을 선언한다. |

기존 `readmeProfile`의 `default`와 `compact` 값은 호환 입력으로 읽는다.
README의 내용과 배치는 독자가 하려는 일에 맞춘다.
[README 규칙](../../../specs/readme.md)에서 기본값과 예시를 읽는다.

## 로컬 native 연결

배포 폴더에서 도입할 로컬 복제본을 지정한다.

```sh
task adopt TARGET="제품폴더"
```

도입 기록은 Git 공통 메타데이터에 저장한다.
같은 복제본의 연결된 worktree에서 그 기록을 읽는다.
후보 파일과 인덱스는 실제로 작업할 worktree를 기준으로 확인한다.
스킬 설치와 저장소 도입은 각각 호스트와 해당 복제본에 기록한다.

기존에 해당 worktree에 연결한 제품 설정은 계속 읽는다.
특정 worktree에서 제품 설정이 필요한 경우 다음 명령으로 지정한다.

```sh
task bind:product TARGET="제품폴더" PRODUCT="제품입력.json"
```

기존 설정을 교체할 때 `BACKUP=제품밖새파일.json`으로 원본을 보관할 수 있다.
손상된 설정이나 빠진 구형 연결은 같은 위치에 유효한 설정을 복구한다.
명시적으로 다른 파일을 지정하는 직접 검사에는 [검사 계약](checker.md)을 사용한다.

## 선택과 예외

대상 저장소의 규칙과 플랫폼 계약에서 실제로 소비하는 값이 있는지 확인한다.
선택 항목에는 그 차이를 설명하는 데이터만 둔다.
한 사용자의 기록이나 출력은 실제 Git 제외 경로나 저장소 밖에 둔다.

### 외부 계약의 좁은 예외

- `repositoryNameException`에는 정확한 `name`을 사용한다.
- `commitConvention`에는 `style: "upstream-area"`와 실제 `areas`를 사용한다.
- `branchNamespace`에는 실제 `prefix`를 쓴다. `kind`는 `host` 또는 `automation`이며 생략하면 `host`다.

각 예외의 `source`, `scope`, `expires`에 근거와 적용 범위를 적는다.
에이전트는 예외를 사용할 때 원문이 현재 대상에 적용되는지 확인한다.
