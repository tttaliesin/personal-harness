# Proposal

## Why

작업 트리에는 독자가 사용하는 진입점과 검증에 필요한 근거를 더 구체적으로 다룬 단독 스킬 지침이 있다.

## What Changes

- README의 퀵스타트를 독자의 진입점에 맞추고 공개 배포물에 들어가는 파일로 설치와 사용 예를 대조한다.
- 해당 실행 시나리오의 설정을 찾고 테스트 의존성의 관리 주체에 따라 준비 상태를 확인한다.
- 출력 경로의 제외 여부와 규칙을 각각 확인하고 Git 인덱스, 푸시할 소스 끝 커밋, 이전 커밋에서 파일을 확인한다.
- 한글과 다른 문자가 섞였을 때 실제 글리프에 적용된 글꼴을 판별하고 폼 컨트롤의 글꼴 패밀리 상속 예시를 좁힌다.

## Capabilities

### New Capabilities

### Modified Capabilities

- `readme-authoring` — 독자의 진입점과 공개 배포 파일에 맞는 README 작성과 확인.
- `development-environment-guidance` — 시나리오별 설정 확인, 의존성 준비 및 폐기 가능한 테스트 상태의 정리.
- `repository-artifact-guidance` — Git 제외 여부, 인덱스와 푸시 이력 확인, 로컬 출력 정리.
- `korean-web-typography` — 혼합 문자열 검증, 폼의 글꼴 패밀리 상속과 지침 선택 범위.

## Impact

대상은 작업 트리에 있는 네 단독 스킬의 본문과 참조 자료, `docs/repository-workflows.md`다.

## 배포 상태

**미배포.** 공개 기준 `a0eca5178f9b58ad727debaf5686a38076014e9e` 이후의 로컬 지침 변경을 기록한다.
