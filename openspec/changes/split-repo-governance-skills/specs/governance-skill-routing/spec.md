# Spec Delta

## Purpose

Repo Governance는 사용자가 요청한 저장소 작업에 맞춰 스킬을 직접 선택할 수 있게 한다.
세 호스트는 같은 배포물에서 스킬을 찾으며 기존 실행 전 검사는 실제 변경 후보에 적용한다.

## ADDED Requirements

### Requirement: 요청한 작업에 해당하는 스킬을 직접 선택한다

에이전트는 스킬 이름의 명시 여부와 관계없이 사용자가 맡긴 작업마다 해당 스킬만 골라야 한다(MUST).
각 스킬을 직접 선택해야 하며 `repo-governance`를 공통 진입 단계로 사용해서는 안 된다(MUST NOT).

#### Scenario: 저장소 이름 또는 설명을 작성·검토·변경한다

- **WHEN** 사용자가 저장소 이름 후보를 제안하거나 GitHub 저장소 설명을 다듬으라고 한다.
- **THEN** Repo Governance 스킬 중 `repo-identity`만 선택한다.
- **AND** 실제로 맡긴 항목에 K1 또는 K2를 적용한다.

#### Scenario: README를 작성·수정·검토한다

- **WHEN** 사용자가 README의 첫 실행 안내를 고치거나 독자가 그 안내를 따라 할 수 있는지 검토하라고 한다.
- **THEN** Repo Governance 규약이 적용되는 대상이면 해당 플러그인의 스킬 중 `repo-readme`를 선택해 K3를 적용한다.

#### Scenario: 커밋 후보 또는 메시지를 다룬다

- **WHEN** 사용자가 커밋 후보의 범위를 정하거나, 커밋 메시지를 작성·검토하거나, 실제로 커밋하라고 한다.
- **THEN** `repo-commit`만 선택해 K4를 적용한다.

#### Scenario: 브랜치를 만들거나 이름을 정한다

- **WHEN** 사용자가 새 브랜치의 이름을 제안하거나, 새 브랜치를 만들거나, 기존 브랜치의 이름을 바꾸라고 한다.
- **THEN** `repo-branch`만 선택해 K5를 적용한다.

#### Scenario: PR 초안·실제 변경·설명 또는 비교 범위를 다룬다

- **WHEN** 사용자가 풀 리퀘스트(PR) 초안, 실제 등록·수정·머지 또는 제목·본문이나 head/base 비교 범위의 검토를 요청한다.
- **THEN** `repo-pull-request`만 선택해 K6를 적용한다.

#### Scenario: 파일의 위치 또는 Git 편입을 결정한다

- **WHEN** 사용자가 새 문서의 위치나 Git 추적 여부를 정하라고 하거나, 생성 로그를 둘 로컬 경로와 제외 규칙을 정하라고 한다.
- **THEN** Repo Governance 규약이 적용되는 대상이면 해당 플러그인의 스킬 중 `repo-file-placement`를 선택해 K7을 적용한다.

#### Scenario: 저장소 이름·README·커밋은 조회할 자료다

- **WHEN** 사용자가 기존 저장소 이름을 배경으로 제시하거나, README의 명령을 찾아 달라고 하거나, 마지막 커밋의 해시를 조회하라고 한다.
- **THEN** Repo Governance 스킬 선택 결과는 비어 있어야 한다.

#### Scenario: 기존 브랜치 작업·PR 코드 리뷰·일반 소스 편집만 요청한다

- **WHEN** 사용자가 기존 브랜치로 전환하거나 현재 브랜치를 조회하거나, PR 번호만 언급하거나, PR의 코드만 리뷰하거나, 기존 소스 파일의 버그만 고치라고 한다.
- **THEN** Repo Governance 스킬 선택 결과는 비어 있어야 한다.

#### Scenario: 한 요청에 커밋과 파일의 편입 판단이 함께 있다

- **WHEN** 사용자가 커밋 메시지를 제안하고 생성 로그를 추적할지도 판단하라고 한다.
- **THEN** `repo-commit`은 메시지에만 적용하고 `repo-file-placement`는 로그의 편입 판단에만 적용한다.
- **AND** Repo Governance 스킬 선택 결과는 이 두 스킬로 한정한다.

### Requirement: Resolve overlapping tasks across Repo Governance and standalone skills

두 번들을 함께 설치한 경우 에이전트는 대상 저장소에 적용되는 규약과 사용자의 요청을 근거로 동일한 판단을 맡을 스킬을 하나만 선택해야 한다(MUST).
채택한 제품 계약은 해당 저장소 작업의 경로와 편입 판단에 적용해야 한다(MUST).
스킬 선택의 근거에는 기존 저장소 지침과 확인한 도입 상태 또는 사용자가 적용하라고 정한 규약을 사용할 수 있다.

#### Scenario: README 작성에 두 스킬의 설명이 모두 맞는다

- **WHEN** 사용자가 Repo Governance 규약이 적용되는 저장소의 README를 새로 쓰거나 첫 실행 안내를 재구성하라고 한다.
- **THEN** `repo-readme`가 README의 구조 및 사용 경로 판단을 맡는다.
- **AND** 같은 README 판단에 `create-readme`를 중복 선택하지 않는다.

#### Scenario: 단독 스킬의 일반 README 작성 범위

- **WHEN** Repo Governance 규약의 적용 근거가 없는 저장소에서 프로젝트 소개 README를 새로 만들거나 주요 섹션을 재구성한다.
- **THEN** `create-readme`가 해당 요청을 맡는다.

#### Scenario: 파일 편입과 별도의 산출물 관리 요청

- **WHEN** 사용자가 채택된 제품 계약이 정한 문서 위치나 Git 편입 범위를 확인하라고 한다.
- **THEN** `repo-file-placement`가 그 판단을 맡고, 같은 판단에 `repository-artifacts`를 중복 선택하지 않는다.
- **AND** 사용자가 다른 작업의 결과물 보관이나 정리도 별도로 요청하면 `repository-artifacts`를 그 부분에만 적용할 수 있다.
- **AND** Repo Governance 규약의 적용 근거가 없는 저장소의 문서·로컬 산출물 관리는 `repository-artifacts`를 사용한다.

#### Scenario: 한국어 README에서 구조와 문서 표현을 함께 다룬다

- **WHEN** Repo Governance가 적용되는 저장소의 한국어 README 작성이 요청된다.
- **THEN** `repo-readme`는 README의 구조와 사용 경로를 맡고 적용 가능한 `ste-ko`는 기술 문서의 표현을 맡는다.
- **AND** README 구조 판단은 한 번만 수행한다.

### Requirement: 명시적인 플러그인 작업에는 기존 스킬을 사용한다

`repo-governance`의 선택 범위는 플러그인 도입, 제품 입력 연결, 플러그인·연결 진단과 기계 검사기 직접 실행을 명시적으로 요청한 경우로 한정해야 한다(MUST).

#### Scenario: 플러그인 도입·제품 연결·진단을 요청한다

- **WHEN** 사용자가 이 clone에 Repo Governance를 도입하거나, 대상 worktree에 제품 입력을 연결하거나, Repo Governance의 훅 거절 원인을 진단하라고 한다.
- **THEN** `repo-governance`만 선택하고 실제 설치 상태와 대상 clone 또는 worktree를 확인한다.

#### Scenario: 기계 검사기를 직접 실행하라고 요청한다

- **WHEN** 사용자가 README 파일을 Repo Governance CLI의 `readme` 검사로 확인하라고 한다.
- **THEN** `repo-governance`만 선택하고 지정된 파일을 읽기 전용 검사기에 전달한다.
- **AND** 보고하는 판정의 범위는 검사기가 실제로 확인한 기계 조건으로 한정한다.

### Requirement: 규약과 판단 근거는 실제 대상에서 확인한다

작업별 스킬은 맡은 규약의 기존 상세안을 기준 원본으로 써야 한다(MUST).
해당 작업의 템플릿이 있으면 필요에 따라 참고한다.
에이전트는 실제 대상과 적용할 제품 계약을 확인하고 현재 저장소 자료와 확인한 결과를 근거로 판단해야 한다(MUST).

#### Scenario: PR 설명에 실제 검증 근거가 필요하다

- **WHEN** 사용자가 PR 설명 초안만 요청하고 대상 제품의 현재 head/base와 diff는 확인되지만 시험 실행 기록은 없다.
- **THEN** 에이전트는 K6과 기존 PR 템플릿을 참고해 실제 비교 범위에 맞는 초안을 제공한다.
- **AND** 시험 결과는 미확인으로 기록하고 실제 PR 변경은 요청 범위에서 제외한다.

### Requirement: 스킬 선택과 실제 변경의 기계 검사는 독립적이다

호스트의 기존 연결부는 지원하는 변경 호출에서 도입·연결 조건이 충족되면 실제 후보에 동일한 기계 검사 계약을 적용해야 한다(MUST).
직접 CLI와 선택형 CI는 각자의 기존 진입점과 읽기 전용 계약을 사용해야 한다(MUST).

#### Scenario: 커밋 요청에서 스킬 선택과 훅 판정을 따로 확인한다

- **WHEN** 도입 기록과 지원 훅이 있는 대상에서 사용자가 커밋만 요청한다.
- **AND** 실제 index에는 링크가 깨진 README 또는 제품 계약에 선언된 로컬 출력 파일이 들어 있다.
- **THEN** 에이전트는 `repo-commit`만 선택한다.
- **AND** 해당 훅이 실행되면 기존 K3 또는 K7 기계 위반으로 실제 커밋 후보를 거절한다.

### Requirement: 세 호스트는 기존 스킬 루트에서 같은 배포물을 발견한다

Codex, Claude Code, pi는 각자의 기존 패키지 등록에서 같은 `skills/` 루트를 사용해야 한다(MUST).
별도 로컬 실행 진입점인 `task run:pi`도 `--skill`에 그 루트를 전달해야 한다(MUST).

#### Scenario: 분리한 스킬을 포함하는 배포물을 검색한다

- **WHEN** 세 호스트가 검증된 동일 배포물의 기존 스킬 루트를 읽는다.
- **THEN** 각 호스트의 목록에 `repo-governance`와 여섯 작업별 스킬이 각각 나타난다.

#### Scenario: 로컬 실행 명령이 pi에 스킬을 연결한다

- **WHEN** `task run:pi`가 로컬 실행 인자를 만든다.
- **THEN** `--skill`은 배포 루트의 `skills/`를 가리켜야 한다.
- **AND** pi `v1.5.2`는 이 경로 아래의 일곱 `SKILL.md`를 재귀적으로 발견할 수 있어야 한다.

### Requirement: 배포 구성과 모델 선택에 각각 검증 근거가 있다

배포물 검증은 전체 배포 파일의 경로·해시·패키지 포함 여부를 기존 검증 절차로 확인해야 한다(MUST).
모델이 선택한 스킬은 실제 요청에서 관찰한 스킬 사용 기록으로 확인해야 한다(MUST).

#### Scenario: 번들 목록과 패키지 파일을 대조한다

- **WHEN** 기존 번들 검증 명령이 바뀐 스킬과 `Taskfile.yml`이 포함된 배포물을 확인한다.
- **THEN** 목록의 경로와 SHA-256이 현재 배포 파일과 일치하고 `npm pack --dry-run` 목록에 같은 경로가 있어야 한다.
- **AND** 스킬 파일이 누락되거나 검증 목록의 해시가 틀리면 검증은 실패한다.

#### Scenario: 목록에 나타난 스킬을 요청에서 선택한다

- **WHEN** 일곱 스킬을 발견한 호스트의 새 세션에서 Repo Governance가 적용되는 저장소의 README 수정을 스킬 이름 없이 요청한다.
- **THEN** Repo Governance 스킬 선택 기록에는 `repo-readme`가 나타나야 한다.
- **AND** 배포 구성만 확인한 경우 모델 선택 결과는 미확인으로 기록한다.

#### Scenario: 두 번들을 함께 설치한 세션에서 선택 범위를 검증한다

- **WHEN** 두 번들을 설치한 같은 호스트에서 채택한 저장소와 채택 근거가 없는 저장소의 동일한 README 작성 및 파일 배치 요청을 비교한다.
- **THEN** 각 작업의 선택 기록에는 해당 저장소에 적용되는 규약을 맡은 스킬 한 개가 있어야 한다.
- **AND** 동일한 판단에 스킬 두 개를 읽거나 채택하지 않은 저장소에 Repo Governance 규약을 적용하면 기대한 선택과 일치하지 않는다.
