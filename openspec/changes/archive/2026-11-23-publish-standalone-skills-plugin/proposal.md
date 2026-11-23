# Proposal

## Why

Codex 사용자가 마켓플레이스에서도 Personal Harness의 단독 스킬을 설치할 수 있게 한다.
두 설치 경로는 각 스킬의 원본을 공유한다.

## What Changes

- `personal-harness` 마켓플레이스에 자체 스킬 `personal-harness-skills`와 어댑터 `personal-harness-adapters`를 각각 추가한다.
- `skills` CLI와 Codex 플러그인에서 유지하는 자체 스킬과 어댑터를 배포한다.
- 두 설치 경로와 플러그인 갱신 방법을 안내한다.

## Capabilities

### New Capabilities

- `skill-and-plugin-distribution`: 단독 스킬 원본에 Codex 마켓플레이스 설치 경로를 추가한다.

### Modified Capabilities

## Impact

루트 마켓플레이스 카탈로그, 두 플러그인의 매니페스트, 배포 문서와 루트 배포 테스트를 갱신한다.
