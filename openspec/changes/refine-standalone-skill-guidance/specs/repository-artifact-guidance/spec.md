# Spec Delta

## MODIFIED Requirements

### Requirement: Respect Git tracking semantics

Git 포함 여부는 Git의 추적 항목, 인덱스와 커밋으로 확인해야 한다(MUST).
패키지 허용 목록, `.npmignore`, 아카이브 제외와 CI 보존 규칙은 각각 해당 배포물이나 산출물에 적용해야 한다(MUST).

#### Scenario: Untracked output needs an ignore check

- **WHEN** 로컬 출력 경로 하나를 Git에서 제외했는지 확인한다.
- **THEN** `git ls-files -- <path>`로 추적 여부를 확인한다.
- **AND** 추적하지 않는 경로의 제외 여부는 `git check-ignore -q -- <path>`의 종료 코드로 판단한다.
- **AND** `0`은 제외, `1`은 제외되지 않음으로 판단하고 Git 오류가 발생하면 확인할 수 없는 상태로 남긴다.

#### Scenario: Diagnose an ignore rule

- **WHEN** 출력 경로에 적용된 제외 규칙이나 예외를 찾는다.
- **THEN** `git check-ignore -v -- <path>`로 일치한 패턴을 확인한다.
- **AND** 종료가 성공해도 `!`로 시작하는 패턴은 해당 경로의 제외를 해제하는 예외로 해석한다.
- **AND** 추적 중인 경로에서 규칙만 진단할 때는 `--no-index`를 사용한다.

#### Scenario: File was already tracked

- **GIVEN** 출력 파일이 이미 추적되고 있다.
- **WHEN** 그 파일에 맞는 Git 제외 패턴을 추가한다.
- **THEN** 파일이 계속 추적되는지 인덱스에서 확인한다.
- **AND** 추적 해제가 요청 범위에 있다면 필요한 로컬 파일을 보존하고 staged 변경을 확인한다.

### Requirement: Verify staged and outgoing artifacts

지침은 확인하려는 경로가 인덱스, 푸시할 소스의 끝 커밋 또는 이전의 푸시 대상 커밋에 포함됐는지 해당 Git 상태에서 확인해야 한다(MUST).

#### Scenario: Staged snapshot includes unchanged entries

- **WHEN** 커밋하기 전에 특정 파일의 포함 여부를 확인한다.
- **THEN** staged diff에 변화가 없는 파일도 `git ls-files --stage -- <path>`로 인덱스에서 확인한다.
- **AND** 변경 상태는 `git status --short -- <path>` 또는 `git diff --cached --name-status -- <path>`로 확인한다.
- **AND** staged 내용에 따라 판단해야 할 때 `git diff --cached -- <path>`를 읽는다.

#### Scenario: Artifact at the source tip

- **WHEN** 푸시할 소스의 끝 커밋에 파일이 있는지 확인한다.
- **THEN** `git ls-tree -r --name-only <source-tip> -- <path>`로 그 커밋의 트리를 확인한다.

#### Scenario: Artifact in an earlier outgoing commit

- **GIVEN** 현재 트리에 없어진 파일이 앞으로 푸시할 이전 커밋에 들어 있을 수 있다.
- **WHEN** 기존 원격 브랜치로 푸시하기 전에 파일 포함 여부를 확인한다.
- **THEN** 의도한 원격 브랜치의 끝 커밋과 푸시할 소스의 끝 커밋 사이에서 경로별 이력을 확인한다.
- **AND** 병합 커밋에서도 부모별 경로 변경을 확인하고 일반 정리에서는 공개 이력을 보존한다.

#### Scenario: First push of a branch

- **GIVEN** 푸시 대상 브랜치가 원격에 없고 이전 커밋에 파일이 들어 있을 수 있다.
- **WHEN** 첫 푸시 전에 파일 포함 여부를 확인한다.
- **THEN** 공개된 기준 커밋을 검증했다면 그 커밋 이후부터 소스의 끝 커밋까지 경로별 이력을 확인한다.
- **AND** 검증된 공개 기준이 없으면 소스의 끝 커밋에서 도달할 수 있는 이력을 확인한다.

### Requirement: Retain and clean up local evidence

검증 중 필요한 로컬 증거는 검증이 끝날 때까지 보존해야 한다(MUST).

#### Scenario: Local evidence needs cleanup

- **WHEN** 작업 범위에 로컬 출력의 정리가 포함된다.
- **THEN** 삭제하기 전에 해당 작업의 폐기 가능한 출력인지 확인한다.
- **AND** 삭제할 출력의 절대 경로를 확인한다.
- **AND** 관련 없는 파일과 유지하는 백업은 보존한다.
- **AND** 공유 산출물과 보관한 로컬 증거를 보고한다.
