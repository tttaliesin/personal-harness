# Proposal

## Why

Taste 2.5.1의 Windows 게이트가 설치된 Edge를 찾지 못하거나 Edge 런처의 정상 종료를 시작 실패로 처리한다.
원본 캐시와 repo-governance를 보존하면서 실제 페이지 검사를 완료해야 한다.

## What Changes

- 저장소 소유 Windows 실행기를 배포하고 Taste 검사에 자율적으로 선택하도록 연결한다.
- 브라우저 경로와 Edge 실행 인수만 검사 자식 프로세스에 적용한다.
- 원본 종료 코드·검사·페이지를 유지한 채 두 PC에서 같은 페이지를 검증한다.

## Capabilities

### New Capabilities

- `taste-windows-runtime`: 원본을 편집하지 않는 Windows Taste 브라우저 검사 실행.

### Modified Capabilities

없음.

## Impact

공통 지침, 저장소 소유 스킬 배포 목록, 실행기와 회귀 검증이 바뀐다.
외부 의존성, hook, 원본 플러그인, repo-governance와 프로젝트 스택은 바뀌지 않는다.
