# Proposal

## Why

한국어 개발 문서의 문장 구조와 기술적 의미를 일관되게 유지할 공통 작성 기준이 필요하다.
번역투나 기계적인 표현이 남은 문서는 작성 기준을 유지하면서 윤문할 수 있어야 한다.

## What Changes

- STE-KO의 문서 규칙을 한국어 개발 문서 작성과 실질적인 수정에 연결한다.
- 윤문이 필요한 문서에서만 `im-not-ai`의 Codex용 `humanize-korean`을 자율적으로 선택한다.
- 수정 구간의 주체, 조건, 예외와 의무·허용·금지를 원문과 대조한다.
- 두 PC의 설치 목록을 갱신하고 이 작업 흐름에서 STE80을 제외한다.

## Capabilities

### New Capabilities

- `korean-development-writing`: STE-KO 기반 문서 작성과 필요할 때 선택하는 의미 보존 윤문.

### Modified Capabilities

## Impact

공통 사용자 지침과 Windows 배포 검증을 갱신한다.
배포 목록은 `ste-ko` 어댑터의 외부 참조와 `humanize-korean`의 원본 경로를 선언한다.
기존 저장소의 문서 계약과 repo-governance를 우선한다.
