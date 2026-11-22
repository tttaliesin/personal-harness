---
name: repo-governance
description: Draft, improve, or check repository names, descriptions, READMEs, commit messages, branch names, pull requests, and file placement using shared conventions and evidence from the actual repository.
---

# Repo governance

1. 확인할 대상과 사용자가 요청한 작업을 파악한다.
2. 아래에서 관련 규칙을 읽는다.
   현재 저장소의 코드·문서·설정·diff 중 권고에 필요한 자료를 확인한다.
3. 자료를 근거로 대상에 맞는 초안이나 다음 작업을 제안한다.
   핵심 사실을 확인하지 못하면 확인된 내용으로 초안을 만들고, 해당 사실이 필요한 변경은 보류한다.
4. 사용자가 변경을 요청했으면 기존 도구로 진행한다.
   초안 요청에는 검토할 문안을 제공한다.

| 작업 | 규칙 | 확인 자료 |
| --- | --- | --- |
| 저장소 이름 | [K1 이름](../../specs/naming.md) | 주요 관리 책임, 공식 도입 단위, 대상 조직의 기존 이름 |
| 저장소 설명 | [K2 description](../../specs/description.md) | 실제 기능, 사용 대상, 현재 제공 상태 |
| README | [K3 README](../../specs/readme.md) · [템플릿](../../templates/README.md) | 처음 읽을 사람, 실제 시작 경로, 확인할 결과 |
| 커밋 | [K4 커밋](../../specs/commits.md) · [K7 파일](../../specs/file-inclusion.md) | 편입할 diff, 변경 목적, 사용자에게 미치는 영향 |
| 브랜치 | [K5 브랜치](../../specs/branches.md) | 작업 목적, 기준 ref, 기존 작업 브랜치 |
| PR | [K6 PR](../../specs/pull-requests.md) · [템플릿](../../templates/PULL_REQUEST.md) | head·base, 실제 diff, 검증 결과와 남은 확인 |
| 파일 배치·편입 | [K7 파일](../../specs/file-inclusion.md) | 파일의 용도, 소비 경로, 추적·제외 상태 |

설치 후 도입한 저장소에서는 하네스 훅이 지원하는 변경의 실제 인자와 Git 후보를 검사한다.
명시적으로 검사를 요청받으면 [읽기 전용 검사기](references/checker.md)를 사용한다.
기계 통과는 확인 가능한 조건에 한정한다.

제품별 선택이나 외부 계약을 적용할 때는 [기준과 제품 입력](references/repository-policy.md)에서 허용 범위를 찾고 실제 출처를 확인한다.
훅에 검사 결과가 있으면 실제 후보의 지적 부분을 고친다.
