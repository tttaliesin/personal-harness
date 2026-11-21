# Proposal

## Why

두 PC에서 Roylabs가 배포한 같은 `repo-governance` 번들을 설치할 수 있어야 한다.
현재 설치기는 Git에서 가져오는 플러그인을 관리하므로, 로컬 폴더로 전달받은 배포본은 별도로 등록해야 한다.

## What Changes

- 등록 목록에 로컬 번들의 마켓플레이스 이름, 플러그인 ID, 버전과 SHA-256을 기록한다.
- PC별 설정에서 해당 마켓플레이스의 배포 폴더를 지정한다.
- 설치기는 배포본을 검증한 뒤 Codex CLI로 등록하고 설치 캐시를 검증한다.
- PC의 설치·적용 상태를 기존 계획과 점검에서 확인할 수 있게 한다.

## Capabilities

### New Capabilities

- `local-plugin-bundles`: PC에서 제공한 로컬 Codex 배포본의 무결성 검증, 등록 및 설치.

### Modified Capabilities

## Impact

등록 목록, 의존성 설치기, 적용 계획과 배포 문서에 영향을 준다.
`repo-governance` 배포본은 Roylabs의 배포 경로에서 받는다.
