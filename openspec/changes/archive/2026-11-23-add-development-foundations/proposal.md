# Proposal

## Why

CodeGraph는 설치되어 있지만 OpenSpec를 두 PC에서 재현 가능하게 사용하는 경로가 없다.
자연어 개발 요청에서 코드 관계와 지속적인 요구사항을 필요에 맞게 사용할 수 있어야 한다.

## What Changes

- 공식 OpenSpec CLI를 버전과 integrity가 기록되는 관리 대상에 추가한다.
- 자연어 작업에 따라 선택하는 `openspec-workflow` 스킬을 배포한다.
- CodeGraph의 선택적 사용 기준을 유지한다.
- 이 저장소에 OpenSpec 프로젝트 구조와 로컬 CodeGraph 인덱스를 준비한다.
- 두 PC에 필요한 도구와 지침만 적용한다.

## Capabilities

### New Capabilities

- `development-tool-routing`: 관리되는 개발 도구와 작업 목적에 따른 코드·명세 사용.

### Modified Capabilities

없음.

## Impact

의존성 설치기, 사용자 지침 생성, 스킬 배포와 설치 문서에 영향을 준다.
OpenSpec CLI에는 Node.js 22.12.0 이상이 필요하다.
기존 runtime과 hook, repo-governance 설정은 보존한다.
