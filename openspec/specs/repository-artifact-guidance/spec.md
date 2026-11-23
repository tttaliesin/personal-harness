# 저장소 산출물 관리 지침

## Purpose

`repository-artifacts`는 저장소의 문서와 테스트 자산을 목적에 맞는 경로에 보관하도록 돕는다.
공유 문서와 재현에 필요한 입력을 보존하고 로컬 자료와 생성 결과의 Git 포함 여부를 확인한다.

## Requirements

### Requirement: Choose disposition by purpose

지침은 자료의 용도와 기존 저장소 규칙에 따라 공유 문서, 로컬 검토 자료, 테스트 입력과 생성 결과의 보관 위치를 정해야 한다(MUST).

#### Scenario: Investigation produces temporary files

- **WHEN** 공유 산출물 요청 없이 조사 메모나 원시 로그가 필요하다.
- **THEN** 필요한 파일은 기존의 추적하지 않는 Git 제외 경로에 둔다.
- **AND** 정해진 경로가 없으면 `.local/reviews/`나 `.local/artifacts/`가 추적되지 않고 실제로 제외되는지 확인하거나 저장소 밖에 보관한다.
- **AND** 대화에서 전달할 수 있는 결론은 대화에서 보고한다.

#### Scenario: Shared specification or test baseline

- **WHEN** 계속 공유하거나 테스트 재현에 필요한 문서나 입력을 보관한다.
- **THEN** 유지하는 문서, 공유하기로 한 검토 결과, OpenSpec 산출물과 테스트 코드·픽스처·시나리오·승인한 기준 데이터를 기존 구조에서 추적한다.
- **AND** 기존에 추적하는 검토·이력 문서의 보존 여부는 용도를 확인해 판단한다.

#### Scenario: Generated test output

- **WHEN** 테스트 로그, 커버리지, 추적 로그, 실제·차이 스크린샷이나 임시 데이터베이스의 위치를 정한다.
- **THEN** 도구의 실제 출력 경로와 CI에 올릴 산출물 경로를 확인한다.
- **AND** 생성 결과는 Git에서 제외한 경로나 의도한 CI 산출물에 보관한다.
- **AND** Git 제외 규칙은 필요한 출력에 한정하고 소스, 픽스처와 승인한 기준 데이터는 계속 추적한다.

### Requirement: Respect Git tracking semantics

Git 포함 여부는 Git의 추적 항목, 인덱스와 커밋으로 확인해야 한다(MUST).
패키지 허용 목록, `.npmignore`, 아카이브 제외와 CI 보존 규칙은 각각 해당 배포물이나 산출물에 적용해야 한다(MUST).

#### Scenario: Untracked output needs an ignore check

- **WHEN** 로컬 출력 경로를 Git에서 제외했는지 확인한다.
- **THEN** `git ls-files -- <path>`로 추적 여부를 확인한다.
- **AND** 추적하지 않는 경로에 적용되는 제외 규칙을 `git check-ignore -v -- <path>`로 확인한다.

#### Scenario: File was already tracked

- **GIVEN** 출력 파일이 이미 추적되고 있다.
- **WHEN** 그 파일에 맞는 Git 제외 패턴을 추가한다.
- **THEN** 파일이 계속 추적되는지 인덱스에서 확인한다.
- **AND** 추적 중인 경로에서 규칙만 진단할 때는 `git check-ignore -v --no-index -- <path>`를 사용한다.
- **AND** 추적 해제가 요청 범위에 있다면 필요한 로컬 파일을 보존하고 staged 변경을 확인한다.

### Requirement: Verify staged and outgoing artifacts

지침은 확인하려는 경로가 인덱스나 푸시할 커밋에 포함됐는지 해당 Git 상태에서 확인해야 한다(MUST).

#### Scenario: Staged snapshot includes unchanged entries

- **WHEN** 커밋하기 전에 특정 파일의 포함 여부를 확인한다.
- **THEN** staged 변경 목록과 내용을 확인한다.
- **AND** staged diff에 변화가 없는 파일도 `git ls-files --stage -- <path>`로 인덱스에서 확인한다.

#### Scenario: Artifact in an earlier outgoing commit

- **GIVEN** 현재 트리에 없어진 파일이 앞으로 푸시할 이전 커밋에 들어 있을 수 있다.
- **WHEN** 브랜치의 첫 푸시 또는 기존 원격 브랜치로의 푸시 전에 파일 포함 여부를 확인한다.
- **THEN** 해당 푸시로 원격에 추가될 커밋의 경로별 이력을 확인한다.
- **AND** 대상 브랜치가 이미 있다면 의도한 원격 브랜치의 끝 커밋과 푸시할 소스의 끝 커밋 사이를 확인한다.
- **AND** 병합 커밋에서도 부모별 경로 변경을 확인하고 일반 정리에서는 공개 이력을 보존한다.

### Requirement: Preserve repository governance ownership

지침은 채택한 repo-governance 계약과 저장소 지침에서 승인한 경로와 Git 추적 제약을 우선해야 한다(MUST).
파일 배치는 대상 저장소의 계약과 기존 OpenSpec 스키마 경로에 맞춰야 한다(MUST).

#### Scenario: Repository defines its own output layout

- **WHEN** 채택한 repo-governance 계약이나 저장소 지침에 문서와 출력 경로가 정해져 있다.
- **THEN** 해당 경로와 예외를 사용한다.

#### Scenario: Adopted governance requires resolution

- **GIVEN** 대상 저장소가 repo-governance를 채택했다.
- **WHEN** 계약이 미해결 상태이거나 해당 작업이 차단됐다.
- **THEN** 계약이 안내하는 해결 경로를 따른다.

#### Scenario: Repository has no adopted governance contract

- **GIVEN** `repository-artifacts`를 설치한 저장소에 채택된 repo-governance 계약이 없다.
- **WHEN** 저장소의 문서나 출력 경로를 정한다.
- **THEN** 저장소 자체의 기존 경로와 추적 규칙을 먼저 적용한다.

### Requirement: Retain and clean up local evidence

검증 중 필요한 로컬 증거는 검증이 끝날 때까지 보존해야 한다(MUST).

#### Scenario: Local evidence needs cleanup

- **WHEN** 작업 범위에 로컬 조사 자료의 정리가 포함된다.
- **THEN** 해당 작업의 폐기 가능한 파일, 임시 대화와 리소스만 정리한다.
- **AND** 삭제할 파일은 절대 경로를 확인한다.
- **AND** 관련 없는 파일과 유지하는 백업은 보존한다.
- **AND** 공유 산출물과 보관한 로컬 증거를 보고한다.
