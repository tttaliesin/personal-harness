<h1 align="center">governance-tool</h1>
<p align="center"><strong>코딩 에이전트에 저장소 이름, README, 커밋을 작성할 때 쓸 팀 규칙과 예시를 제공합니다.</strong></p>
<p align="center">
  <a href="plugin/README.md#codex-desktop에-설치"><strong>Codex Desktop 설치</strong></a>
  · <a href="plugin/README.md#규약">일곱 규약 보기</a>
  · <a href="plugin/README.md#검증과-지원-상태">지원 환경 확인</a>
</p>

**에이전트에 요청하기**

```text
$repo-governance
새 팀원이 설치본을 연결하고 첫 작업을 할 수 있게 이 저장소의 README를 정리해 줘.
기존 설치를 갱신하는 방법은 해당 안내로 연결해 줘.
```

에이전트는 실제 설치 경로와 명령을 읽고, 처음 설치하는 사람에게 필요한 내용을 제안합니다.
이미 쓰고 있는 팀원은 README의 갱신 링크에서 바로 이어갑니다.

## 소스에서 시작하기

[플러그인 사용 안내](plugin/README.md)는 `plugin/`을 설치 원본으로 사용합니다.
별도 설치 폴더가 필요하면 저장소 루트에서 다음 명령을 실행합니다.
Node.js 22.18 이상, npm, Git, Task 3이 필요합니다.

```sh
task package DEST="../repo-governance-runtime"
```

배포 경로는 새 외부 폴더를 지정합니다.
명령이 끝나면 그 폴더에서 [설치와 저장소 도입](plugin/README.md#시작하기)을 이어갑니다.

## 개발

루트에서 `task test`로 회귀 테스트를 실행합니다.
배포 파일을 바꾼 뒤 `task bundle:build`와 `task verify:bundle`로 설치본을 확인합니다.
[공통 명세](plugin/SPEC.md)에서 적용 범위를, [README 디자인](docs/DESIGN.md)에서 이 저장소의 화면 배치를 확인합니다.

| 경로 | 용도 |
| --- | --- |
| [plugin/](plugin/) | 사용자가 설치하는 스킬, 템플릿, 검사기와 하네스 연결 |
| [tests/](tests/) | 회귀 테스트와 시험 자료 |
| [scripts/](scripts/) | 설치본을 만드는 코드와 개발용 검사 |

변경은 [커밋 규칙](plugin/specs/commits.md)과 [PR 규칙](plugin/specs/pull-requests.md)을 따릅니다.
