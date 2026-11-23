# Proposal

## Why

Repo Governance의 일곱 규약과 실제 실행 전 검사 계약은 이관한 명세, 배포 리소스, 하네스별 연결과 테스트에 걸쳐 있다.
후속 변경에서 규약의 작성 기준과 공개 배포본 `0.2.0`의 판정을 대조할 수 있도록 OpenSpec 기준선을 만든다.

## What Changes

- K1–K7 문안과 파일 배치를 판단하는 근거, 적용을 보류하는 조건을 기록한다.
- 실제 대상의 도입과 제품 계약을 찾는 순서, 읽기 전용 검사기의 입력과 판정을 규격화한다.
- Codex Desktop, Claude Code, pi가 연결하는 도구와 Git·GitHub 변경 후보를 검사하는 조건을 기록한다.
- 선택형 CI의 입력과 판정 범위를 정의한다.
- 이관한 설계의 목표, 공개 배포에서 확인한 동작, 별도 검증이 필요한 지원 항목에 각각 검증 근거를 연결한다.

## Capabilities

### New Capabilities

- `repository-conventions` — K1–K7에 따른 근거 기반 문안과 파일 배치 제안.
- `governance-contract-resolution` — 저장소 도입, 대상별 제품 입력 선택, 공통 배포와 이전 설정의 호환.
- `governance-machine-checks` — 읽기 전용 검사기의 자료 형식, 규칙별 기계 판정, 결과 계약.
- `governance-host-hooks` — 세 하네스의 실행 전 연결, 도구 판별과 호스트별 허용·거절 결과.
- `governance-mutation-verification` — 지원 Git·GitHub 작업의 실제 대상, 반영 후보 및 재확인.
- `governance-ci-checks` — 팀이 명시적으로 적용하는 PR 워크플로와 revision 검사.

### Modified Capabilities

## Impact

- `packages/repo-governance/`의 공통 규약, 검사기, 연결부와 선택형 CI를 사용자와 호출자가 관찰하는 동작으로 기록한다.
- 문서 기준선은 공개 `main`의 `2898d6fff4d3515143b3cc25546286053ae1850d`와 이관 커밋 `960a841`의 원설계 기록이다.
