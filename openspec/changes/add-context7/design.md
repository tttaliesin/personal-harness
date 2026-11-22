# Design

## Context

동기는 proposal.md에 기록한다.
기존 설치기는 하위 경로의 공식 Codex 플러그인과 Git ref의 정확한 commit을 지원한다.
Context7의 모노레포 릴리스 번호와 플러그인 manifest 버전은 서로 다르다.

## Goals / Non-Goals

**Goals:** 기존 registry와 lock을 사용하고 두 PC에 동일한 원본을 설치한다.

**Non-Goals:** 새 승인 단계, 강제 선행 검사, 원본 스킬 패치와 repo-governance 변경을 추가하지 않는다.

## Decisions

- 공식 `context7@context7-marketplace`와 하위 manifest를 `git-ref: master`로 등록한다.
  설치 시 해석한 commit과 전체 플러그인 digest를 lock으로 고정한다.
- 공식 플러그인이 제공하는 MCP와 스킬을 사용한다.
  별도의 같은 MCP를 중복 등록하지 않는다.
- 선택 조건은 `packages/harness/resources/common/AGENTS.md`에서 관리한다.
  프레임워크 이름의 등장만으로 모든 작업에 조회를 강제하지 않는다.
- Context7 이외의 기존 도구 버전은 이번 배포에서 유지한다.
  인증은 각 PC의 공식 로그인 경로에 남기며 Git에 저장하지 않는다.

## Risks / Trade-offs

- OAuth 또는 서비스 한도가 필요할 수 있다 → 실제 조회와 설치 성공을 분리해 확인한다.
- 문서의 버전이 부족할 수 있다 → 공식 문서와 소스 확인으로 계속한다.
- 원격 실험 도구는 계정 상태에 따라 달라질 수 있다 → 실제 제공 도구를 확인하고 자동 외부 피드백을 요구하지 않는다.

## Migration Plan

등록·lock·지침을 검증한 뒤 기존 task apply/check로 두 PC에 적용한다.
필요하면 생성된 기존 harness 백업을 사용해 해당 변경을 복구한다.
