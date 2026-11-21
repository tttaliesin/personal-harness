<h1 align="center">governance-tool</h1>
<p align="center"><strong>저장소 이름과 문서, Git 작업에 팀이 바로 써 볼 수 있는 규칙과 예시를 제공합니다.</strong></p>
<p align="center">
  <a href="#시작하기"><strong>Codex Desktop에서 시작</strong></a>
  · <a href="#규약">일곱 규약 보기</a>
  · <a href="#검증과-지원-상태">지원 환경 확인</a>
</p>

## 시작하기

Node.js 22.18 이상, npm, Git, Task 3이 필요합니다.
소스에서는 `plugin/`, 배포본에서는 받은 설치 폴더를 엽니다.

### Codex Desktop에 설치

터미널에서 `codex --version`이 실행되는지 확인합니다.

1. 설치 폴더에서 `task setup:codex`를 실행합니다.
2. Codex Desktop의 **설정 → Hook → Repo Governance**를 엽니다.
3. 앱이 검토를 요청하면 실행 명령과 적용 범위를 확인한 뒤 **신뢰**를 누릅니다.

**첫 작업 전 훅이 신뢰되고 활성화됐는지 확인하세요.**
훅이 **변경됨** 상태면 Codex는 해당 훅을 건너뜁니다.

### 저장소에 규약 적용

설치 폴더에서 `제품폴더`를 적용할 Git 저장소의 경로로 바꿔 실행합니다.

```sh
task adopt TARGET="제품폴더"
```

명령은 설치본을 검증하고 해당 복제본에 도입을 기록합니다.
연결된 worktree는 도입 기록을 함께 사용합니다.
기준 브랜치나 로컬 출력 경계를 지정할 팀은 [제품별 설정](skills/repo-governance/references/repository-policy.md#제품별-최소-입력)을 참고합니다.

Codex에서는 작업 폴더 자체를 프로젝트로 엽니다.
앱의 신뢰 표시가 **모든 프로젝트**이면 훅은 전체에서 호출되고 실제 저장소의 도입 기록에 따라 규칙을 적용합니다.

### 첫 작업

```text
$repo-governance
이 저장소를 처음 쓰는 사람이 어디서 시작할지 README에 보여줘.
```

스킬은 실제 자료에서 기본 경로를 찾아 README를 제안합니다.
README 초안은 편집해서 저장할 수 있습니다.
커밋 직전에 훅이 실제 편입할 README의 링크와 구조, 파일 범위, 커밋 메시지를 확인합니다.
검사만 필요하면 에이전트에 검사 요청을 하거나 [직접 검사](skills/repo-governance/references/checker.md)를 사용합니다.

## 규약

| 규칙 | 작성할 때 받는 도움 |
| --- | --- |
| [K1 저장소 이름](specs/naming.md) | 제품과 관리 범위를 함께 찾을 수 있는 이름 |
| [K2 설명](specs/description.md) | 현재 역할과 기능이 보이는 짧은 한국어 설명 |
| [K3 README](specs/readme.md) | 독자의 시작 경로에 맞춘 문안과 [예시](templates/README.md) |
| [K4 커밋](specs/commits.md) | 실제 변경에 맞는 유형과 한국어 요약 |
| [K5 브랜치](specs/branches.md) | 작업 목적과 기준이 분명한 이름 |
| [K6 PR](specs/pull-requests.md) | 바꾼 이유, 내용, 실제 확인 결과를 설명하는 [본문 예시](templates/PULL_REQUEST.md) |
| [K7 파일 포함·제외](specs/file-inclusion.md) | 함께 관리할 원본과 로컬에 둘 출력의 위치 |

## 연결하기

| 환경 | 연결 | 상세 안내 |
| --- | --- | --- |
| Codex Desktop | 앱 설치, 저장소 도입, 훅 신뢰 | [설치와 실제 세션](skills/repo-governance/references/codex-tools.md) |
| Claude Code | 공통 스킬과 플러그인 훅 | [Claude Code](skills/repo-governance/references/claude-code-tools.md) |
| pi | 공통 스킬과 extension | [pi](skills/repo-governance/references/pi-tools.md) |

Claude Code와 pi는 호스트 실행 파일과 모델 인증이 필요합니다.
설치 폴더에서 도입한 저장소로 세션을 시작합니다.

```sh
task run:claude TARGET="제품폴더"
task run:pi TARGET="제품폴더"
```

## 설치 갱신

1. 새 설치 폴더에서 `task update:codex`를 실행합니다.
2. Desktop의 **설정 → Hook → Repo Governance**에서 검토가 필요한지 확인합니다.
3. 훅이 신뢰되고 활성화된 상태에서 새 작업 대화를 엽니다.

호환되는 제품 설정과 도입 기록은 기존 위치에서 다시 사용합니다.
설정이 손상됐거나 지원하지 않는 형식으로 바뀌었을 때는 [갱신과 복구](skills/repo-governance/references/codex-tools.md#설치-갱신과-문제-해결)를 확인합니다.

## 검증과 지원 상태

| 환경 | 지원 동작 | 실제 모델 세션 |
| --- | --- | --- |
| Codex Desktop | 공통 스킬과 실행 전 검사 훅 | Windows에서 `dc9cbe76`의 훅 신뢰 후 첫 세션 확인. 정상 README 커밋 통과와 깨진 링크 차단. [재현 절차](skills/repo-governance/references/codex-tools.md#실제-desktop-검증) |
| Claude Code | 공통 스킬과 플러그인 훅 | 보류 |
| pi | 공통 스킬과 `tool_call` 연결 | 보류 |

자동 검사는 하네스가 훅에 전달하고 어댑터가 후보를 확인할 수 있는 변경에 적용합니다.
새 설치본의 시험은 일상 설치 단계와 별도로 [검증 방법](skills/repo-governance/references/verification.md)에 정리돼 있습니다.
실제로 실패했을 때 설치 폴더에서 `task doctor`로 설치본과 검사기를 확인할 수 있습니다.

## 구성과 문서

[공통 명세](SPEC.md)와 [스킬](skills/repo-governance/SKILL.md)에 규약과 작업 방식을 설명합니다.
[템플릿](templates/)에서 README와 PR 예시를 찾을 수 있습니다.
[선택형 CI 템플릿](templates/github-actions.yml)은 팀이 별도로 활성화하며, [검사기 안내](skills/repo-governance/references/checker.md)는 직접 검사 명령을 설명합니다.

변경은 [커밋 규칙](specs/commits.md)과 [PR 규칙](specs/pull-requests.md)을 따릅니다.
