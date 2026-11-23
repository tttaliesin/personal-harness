# Design

## Context

기존 설치기는 CodeGraph CLI와 MCP를 관리한다.
공통 지침은 이미 그래프 조회의 강제 선행을 제거한 상태다.
OpenSpec 2.0의 공식 propose 스킬은 구현 요청에도 제안서 작성 후 새 요청을 기다리도록 한다.

## Goals / Non-Goals

**Goals:**
설치 경로와 버전을 재현하고 필요한 명세를 유지하면서 승인된 개발 작업을 계속 수행한다.

**Non-Goals:**
모든 작업의 OpenSpec 전환, 새로운 MCP·hook 등록, repo-governance 변경은 이번 설계의 대상이 아니다.

## Decisions

### 독립적인 CLI 의존성

OpenSpec를 CodeGraph와 같은 수준의 관리 대상 CLI로 추가한다.
MCP 등록 모델을 재사용하면 실제 전송 서버가 없는 도구를 MCP로 표현하게 되므로 별도 lock 항목을 사용한다.
이전 lock에 항목이 없으면 locked 재현은 기존 구성으로 동작한다.

### 작은 사용자 연동 스킬

공식 CLI의 schema와 artifact instructions를 사용하고 선택 기준과 작업 권한은 공통 지침에서 관리한다.
공식 작업 스킬 전체를 수정해 배포하는 대신 저장소에서 작성한 `openspec-workflow`를 사용자 스킬로 배포한다.
프로젝트 초기화는 `--tools none`으로 수행한다.
기존 프로젝트의 다른 OpenSpec 통합은 유지한다.

### 적용 범위 제한

두 PC의 기존 상태에 OpenSpec 경로와 lock 항목을 추가한다.
실제 프로필 적용은 생성된 사용자 지침과 연동 스킬로 제한한다.
Roylabs의 기존 Desktop 설정 차이는 이 적용에서 덮어쓰지 않는다.
적용 전후 기존 config와 hook·repo-governance 파일을 비교한다.

## Risks / Trade-offs

최상위 npm package integrity는 전체 전이 의존성 트리의 고정을 의미하지 않는다.
이 보장은 기존 CodeGraph와 같으며 완전한 오프라인 재현성으로 보고하지 않는다.

자동 스킬 선택은 실제 모델 판단에 의존한다.
이 단계는 선택 지침과 동작 경로를 검증하며 개발 성능 향상을 측정한 것으로 주장하지 않는다.

CodeGraph의 upstream integration refresh는 자체 AGENTS 블록을 다시 쓸 수 있다.
CLI 갱신은 Harness 설치기를 사용하고 인덱스 생성과 갱신은 별도 CLI 명령으로 수행한다.

## Migration Plan

임시 프로필 테스트를 통과한 뒤 두 PC에서 OpenSpec만 설치하고 대상 지침과 스킬을 백업 후 적용한다.
검증 실패 시 해당 적용 백업과 이전 상태 기록으로 복원한다.
프로젝트 명세와 초기 인덱스는 이 저장소에만 준비한다.
