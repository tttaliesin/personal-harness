# Proposal

## Why

사이트 제작과 시각 디자인 작업에 Taste Skill 원본을 자동 선택해 사용할 수 있어야 한다.
두 PC의 설치 결과와 향후 갱신 기준을 프로젝트 등록 목록에서 관리해야 한다.

## What Changes

- 공식 Taste Skill Codex 플러그인을 최신 안정 릴리스 기준으로 등록한다.
- 정확한 commit과 전체 원본 파일 해시를 lock에 기록한다.
- 사이트 제작과 디자인 작업에서 모델이 스킬을 선택하는 공통 지침을 추가한다.
- 기존 프로젝트의 스택·동작·배포 경로와 repo-governance를 보존한다.
- 두 PC에 같은 원본을 설치하고 적용 결과를 검증한다.

## Capabilities

### New Capabilities

- `frontend-design-skill`: 원본 디자인 스킬의 관리 설치와 작업 목적에 따른 선택.

### Modified Capabilities

없음.

## Impact

프로젝트 등록 목록, 의존성 lock, 공통 사용자 지침과 도구 사용 문서에 영향을 준다.
플러그인 원본은 공식 Codex CLI가 설치하며 스킬과 참조 파일을 수정하지 않는다.
기존 프로젝트 소스와 repo-governance는 이번 설치의 수정 대상이 아니다.
