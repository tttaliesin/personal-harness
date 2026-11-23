# Proposal

## Why

공개 `repo-governance` `0.2.0`의 CI 템플릿은 고정한 Personal Harness checkout의 `./packages/repo-governance/plugin`에 있는 검사기를 불러오지 못한다. [공개 CI 명세](../../specs/governance-ci-checks/spec.md)

## What Changes

- 워크플로는 이전 두 배치와 공개 마켓플레이스 배치에서 검사기 파일을 순서대로 찾는다.
- 검사기 파일이 있는 첫 경로를 사용한다.
- 모든 후보에 검사기 파일이 없으면 워크플로는 PR 검사 전에 누락 오류로 실패한다.

## Capabilities

### New Capabilities

### Modified Capabilities

- `governance-ci-checks`의 공통 검사기 선택 조건을 갱신한다.

## Impact

- 작업 트리의 [CI 템플릿](../../../packages/repo-governance/plugin/templates/github-actions.yml)과 [CI 테스트](../../../packages/repo-governance/tests/ci.test.mjs)의 경로 변경을 기록한다.

## 배포 상태

**미배포.** 경로를 수정한 템플릿과 테스트는 로컬 작업 트리에 있다.
