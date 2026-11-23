# Proposal

## Why

현재 `repo-governance` 스킬의 설명은 일곱 저장소 규약을 하나의 선택 대상으로 제공한다.
규약별 작업을 여섯 스킬로 나누면 에이전트가 요청에 필요한 지침만 읽을 수 있다.

## What Changes

- 기존 `repo-governance` 이름을 유지한다.
  플러그인 도입·제품 연결·진단이나 기계 검사기 직접 실행을 명시적으로 요청한 경우에만 선택한다.
- `plugin/skills/`에 `repo-identity`, `repo-readme`, `repo-commit`, `repo-branch`, `repo-pull-request`, `repo-file-placement`를 추가한다.
  에이전트는 각 작업에 맞는 스킬을 직접 선택한다.
- 자체 스킬 번들과 함께 설치했을 때 README 작성과 파일 편입 판단의 중복 선택을 줄이는 조건을 정의한다.

## Capabilities

### New Capabilities

- `governance-skill-routing` — 요청에 따른 스킬 선택과 세 호스트의 배포물 검색.

### Modified Capabilities

## Impact

제품 변경은 `packages/repo-governance/plugin/`의 스킬 지침, 로컬 `run:pi`의 스킬 경로와 검증용 번들 목록에 반영한다.
공개 배포의 작성 판단은 [현행 저장소 규약 명세](../../specs/repository-conventions/spec.md)에서 확인한다.

## 배포 상태

**미배포.** 스킬 분할과 pi 경로 조정은 로컬 작업 트리에 있다.
단독 스킬과의 선택 순서는 이번에 명세화했고 실제 호스트에서의 선택은 미확인 상태다.
