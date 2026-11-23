# Proposal

## Why

두 PC에서 라이브러리와 버전별 문서를 필요할 때 조회할 수 있도록 공식 Context7을 제공한다.
명시적 호출 없이 작업 목적에 따라 선택하면서 기존 개발 흐름을 유지한다.

## What Changes

- 공식 Codex 플러그인을 등록하고 정확한 설치 commit과 원본 digest를 lock에 기록한다.
- 문서 확인이 필요한 작업에서 Context7을 자율 선택하는 공통 지침을 배포한다.
- 두 PC의 실제 설치·조회 결과와 인증 조건을 확인한다.

## Capabilities

### New Capabilities

- `library-documentation`: 공식 Context7 배포와 선택적 라이브러리 문서 조회.

### Modified Capabilities

없음.

## Impact

등록 목록, 의존성 lock, 공통 사용자 지침과 개발 도구 문서를 변경한다.
기존 설치기를 사용하며 인증·런타임·hook 신뢰·repo-governance를 유지한다.
