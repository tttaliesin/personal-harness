# Spec Delta

## Purpose

지원하는 파일·Git·GitHub 변경의 실제 대상과 반영 후보를 기존 도구가 실행되기 전에 확인한다.
검사에 사용한 경로, index와 원격 리비전을 식별해 이후 관측한 변경이나 실행 결과를 대조할 수 있게 한다.

## ADDED Requirements

### Requirement: Inspect supported file edits against actual product paths

연결부는 지원하는 `apply_patch`, `write`, `write_file`, `edit`, `edit_file`에서 실제 worktree와 대상 경로를 확인하고 K7을 적용해야 한다(MUST).

#### Scenario: 초안 작성과 선언한 로컬 출력 쓰기

- **WHEN** 지원 파일 편집에서 일반 README 초안과 선언한 로컬 출력 후보를 확인한다.
- **THEN** 둘 다 생성 또는 수정 경로의 K7 검사 대상이 된다.
- **AND** 초안 내용의 K3 검사는 실제 커밋이나 지원하는 원격 직접 반영에서 수행한다.
- **AND** 선언 출력의 추적 충돌이나 실제 Git 제외 위반은 쓰기 전에 거절한다.

#### Scenario: 이동 패치와 제품 밖의 작업 자료

- **WHEN** 패치가 파일 이동을 포함하거나 쓰기 경로가 선택한 제품 밖에 있다.
- **THEN** 연결부는 지원하는 이동 패치의 원래 경로와 목적지를 검사 후보로 사용한다.
- **AND** 경로와 실제 위치가 모두 제품 밖인 파일만 주어지면 `outside-selected-product`를 보고한다.
- **AND** 별칭으로 제품 경계를 넘거나 경로를 확정할 수 없으면 해당 후보를 보류한다.

### Requirement: Use the actual staged candidate for commit checks

지원하는 일반 커밋과 명시적 amend에서 연결부는 사용할 메시지와 대상 worktree의 index로 K4·K7을 검사해야 한다(MUST).
변경된 README가 있으면 같은 index의 자료로 K3을 수행해야 한다(MUST).

#### Scenario: 작업 트리와 실제 staged README가 다름

- **WHEN** 정상 작업 트리 문서와 깨진 상대 링크가 들어 있는 staged 문서로 지원 커밋을 요청한다.
- **THEN** 연결부는 index의 README와 같은 후보의 경로·앵커를 검사하고 `K3/link-missing`으로 원래 호출을 거절한다.
- **AND** 반대로 링크 대상까지 함께 stage해 후보가 유효하면 K3 검사를 통과한다.

#### Scenario: 일반 커밋과 amend의 비교 기준이 다름

- **WHEN** 같은 index로 일반 커밋과 명시적 amend 후보를 각각 확인한다.
- **THEN** 일반 커밋은 현재 HEAD를, amend는 교체 대상 HEAD의 실제 부모를 비교 기준으로 사용한다.
- **AND** 루트 커밋을 amend할 때는 전체 후보를 검사한다.
- **AND** 해당 비교에서 삭제한 README는 삭제 사실로 관측한다.

#### Scenario: 필요한 메시지 또는 index를 확정할 수 없음

- **WHEN** 요청이 실제 반영할 메시지를 읽을 수 없거나, 파일 선택 방식 또는 메시지 정리 조건으로 사전에 후보를 확정할 수 없다.
- **THEN** 연결부는 해당 지원 검사를 보류하고 확인할 메시지나 편입 후보를 알린다.
- **AND** `-a` 또는 경로 인자로 실행 중에 편입 범위를 만드는 요청은 이 보류 조건에 포함한다.
- **AND** 지원 범위에는 명시적 메시지, 읽을 수 있는 메시지 파일 또는 메시지를 유지하는 지원 amend의 기존 HEAD 메시지가 포함된다.

### Requirement: Inspect new branch names at the command's selected worktree

연결부는 지원하는 `git branch` 생성·이름 변경과 `git switch`·`git checkout`의 생성 요청에서 새 이름을 K5로 검사해야 한다(MUST).

#### Scenario: 다른 worktree에서 명시한 기준으로 브랜치 생성

- **WHEN** 지원하는 리터럴 명령의 작업 디렉터리나 `git -C`가 다른 worktree를 가리킨다.
- **THEN** 연결부는 그 worktree의 규칙과 ref를 사용한다.
- **AND** 시작 ref가 명시되면 그 ref를, 기본 선택이면 해당 worktree의 HEAD를 기준으로 확인한다.
- **AND** 동명 ref가 있거나 시작점을 확인할 수 없으면 해당 적용을 보류한다.

#### Scenario: 기존 브랜치 선택 또는 목록 조회

- **WHEN** 호출의 효과가 기존 브랜치 선택이나 목록 조회다.
- **THEN** 연결부는 해당 호출을 신규 브랜치 이름 검사 대상으로 삼지 않는다.

### Requirement: Inspect explicit repository metadata changes

연결부는 지원하는 `gh repo create`, `gh repo rename`, `gh repo edit`와 GitHub의 구조화된 저장소 생성·이름 변경·수정에서 지정한 규약 필드를 검사해야 한다(MUST).

#### Scenario: 이름과 설명을 함께 지정

- **WHEN** 지원하는 저장소 생성 입력에 새 이름과 설명을 모두 제공한다.
- **THEN** 연결부는 실제 이름에 K1을, 설명에 K2를 적용한다.
- **AND** 이름 변경은 새 이름을, 설명만 수정하는 입력은 제공한 설명을 검사한다.
- **AND** 이름의 실제 가용성과 변경 권한은 별도 근거와 기존 호스트 조건에 따라 확인한다.

### Requirement: Bind direct remote file checks to a verified GitHub branch snapshot

지원하는 GitHub.com의 구조화된 `create_file`과 `update_file`은 실제 저장소, 상대 경로, 메시지, 내용과 대상 브랜치 후보를 확인해야 한다(MUST).
수정에는 해당 브랜치의 현재 blob 식별값을 확인해야 한다(MUST).

#### Scenario: README를 원격 브랜치에 직접 생성

- **WHEN** 요청의 저장소가 로컬 `origin`과 일치하고, 읽기 전용 조회로 대상 브랜치의 현재 commit을 확인했으며 그 객체를 로컬에서 읽을 수 있다.
- **THEN** 연결부는 그 트리에서 경로의 빈 상태를 확인하고 메시지에는 K4, 파일 편입에는 K7을 적용한다.
- **AND** README 내용의 경로와 상대 링크는 같은 원격 commit과 반영할 내용을 기준으로 K3을 검사한다.
- **AND** 요청이 브랜치를 생략하면 조회로 확인한 원격 기본 브랜치를 사용한다.

#### Scenario: 수정 대상이 조회 당시 후보와 일치하지 않음

- **WHEN** 요청이 가리키는 현재 blob이 실제 대상 브랜치에 없거나 요청 저장소·ref·로컬 commit 근거를 확인할 수 없다.
- **THEN** 연결부는 원래 원격 쓰기를 보류하고 일치하지 않거나 누락된 증거를 보고한다.
- **AND** 확인할 수 있는 전체 후보가 없는 일반 파일·트리·ref 쓰기는 지원 검사에서 보류한다.

### Requirement: Verify explicit PR creation refs from the requested remote repository

연결부는 구조화된 `create_pull_request` 또는 리터럴 `gh pr create`·`gh pr new`의 같은 GitHub.com 저장소 생성 후보를 K6으로 검사해야 한다(MUST).

#### Scenario: 명시한 head와 base의 생성 후보

- **WHEN** 요청이 실제 `owner/repo`, 같은 저장소의 head·base, 제목, 본문과 선택적 draft 상태를 명시한다.
- **THEN** 연결부는 두 ref를 읽기 전용으로 조회하고 정확한 ref, 저장소, commit 유형과 전체 OID를 대조한다.
- **AND** 확인한 자료로 번호 없는 `pr-create` Source를 구성한다.
- **AND** CLI가 지원하는 본문 파일은 읽을 수 있는 UTF-8 일반 파일의 내용으로 검사한다.

#### Scenario: 생성 후보의 원격 식별값이 부족함

- **WHEN** 대상·ref·조회 응답이 일치하지 않거나, 인증·시간 제한으로 조회를 완료하지 못하거나, 명시한 내용이 지원 범위를 벗어난다.
- **THEN** 연결부는 생성을 보류하고 확인할 자료를 알려준다.
- **AND** 원격 조회 실패를 보고할 때 인증 정보와 원시 오류 응답을 노출하지 않는다.

### Requirement: Verify the current PR and proposed metadata before editing

연결부는 지원하는 `gh pr edit`와 구조화된 `update_pull_request`의 실제 저장소·PR 번호를 조회하고, 새 제목·본문·대상 브랜치가 적용된 후보를 검사해야 한다(MUST).

#### Scenario: 제목만 바꾸거나 대상 브랜치를 바꿈

- **WHEN** 조회한 PR의 URL, 번호, 전체 head·base OID, 제목과 본문이 요청과 일치한다.
- **THEN** 연결부는 바꿀 값과 조회한 기존 값을 합쳐 K6 후보를 만든다.
- **AND** 대상 변경은 같은 저장소의 열린 PR과 현재 head 이름과 다른 브랜치를 요구한다.
- **AND** 새 대상의 실제 원격 ref와 전체 commit OID를 확인해 기존 head와 비교할 새 base로 사용한다.

#### Scenario: 지원 범위를 넘어선 PR 상태 변경

- **WHEN** 같은 도구 호출이 확인할 수 없는 PR 상태·준비 단계·권한 변경을 요구한다.
- **THEN** 연결부는 해당 입력을 보류하고 확인한 제목·본문만으로 실행 전체를 통과시키지 않는다.

### Requirement: Check the explicit squash integration candidate before handing off to GitHub

연결부는 지원하는 `gh pr merge` 또는 구조화된 `merge_pull_request`에서 명시적 squash, 저장소, PR 번호, 예상 head 전체 OID와 최종 제목·본문을 확인해야 한다(MUST).

#### Scenario: 열린 PR의 통합 후보 확인

- **WHEN** 같은 GitHub.com 저장소의 열린 비초안 PR이 예상 head와 일치하고 조회 결과가 머지 가능·깨끗한 상태와 충족된 검사·리뷰 조건을 나타낸다.
- **THEN** 연결부는 로컬 `origin`과 실제 head·base commit을 대조하고 base가 head의 조상인지 확인한다.
- **AND** PR 내용에는 K6, 최종 squash 메시지에는 K4, 조회한 base와 head 사이의 파일 후보에는 K7을 적용한다.
- **AND** 원래 도구는 GitHub의 현재 조건으로 실제 머지를 처리한다.

#### Scenario: 오래된 예상 head 또는 확인할 수 없는 편입 파일

- **WHEN** 조회한 head가 달라졌거나 충돌·리뷰·검사 조건을 충족하지 못했거나 일치하는 로컬 객체가 없다.
- **THEN** 연결부는 머지를 보류하고 불충분한 자료를 알린다.
- **AND** 명시한 squash 후보 이외의 머지 방식이나 추가 변경을 함께 요구하는 호출도 보류한다.

### Requirement: Reconfirm changed evidence and compare the actual result

에이전트는 검사 뒤 대상·내용·기준의 변경을 관측하면 현재 자료로 해당 검사를 다시 확인해야 한다(MUST).
실제 변경이 끝나면 결과를 사용자가 요청한 대상과 후보에 맞춰 대조해야 한다(MUST).

#### Scenario: 조회 후 원격 기준이나 로컬 메시지 파일이 바뀜

- **WHEN** 도구를 실행하기 전에 원격 base, 파일 내용 또는 로컬 후보의 변화를 새로 확인한다.
- **THEN** 이전 관측값은 이전 후보를 식별하는 근거로 사용하고 현재 후보를 다시 확인한다.
- **AND** 예상 head 조건이 있어도 실제 결과의 base 및 반영 내용을 서버 응답에서 확인한다.
