# Proposal

## Why

자체 플러그인 세 개를 설치하려면 PC마다 배포본을 준비하고 로컬 경로를 설정해야 한다.
Codex의 Git 마켓플레이스를 사용하면 같은 공개 저장소에서 배포본을 받아 설치할 수 있다.

## What Changes

- 공개 기본 브랜치 `main`의 `.agents/plugins/marketplace.json`에 `personal-harness` 마켓플레이스를 게시한다.
- `repo-governance` `0.2.0`, Windows Agent Devkit `0.3.5`, Worker Orchestrator `0.1.6`을 첫 배포본으로 제공한다.
- 세 플러그인의 설치를 Codex CLI로 전환한다.
- 공통 설치기는 이전 번들 경로 설정을 건너뛰고 공통 설정, 스킬과 외부 의존성을 계속 처리한다.
- 기존 로컬 등록을 사용한 PC에서는 사용자가 활성 출처를 한 번 전환한다.

## Capabilities

### New Capabilities

- `codex-git-marketplace` — 공개 `main`에서 Codex의 기본 Git 마켓플레이스 기능으로 자체 플러그인을 배포한다.

### Modified Capabilities

## Impact

배포 목록, 공개 배포 경로, 공통 설치기의 이전 번들 처리와 설치 문서를 갱신한다.
자체 플러그인의 소스는 기존 `plugins/`에 둔다.
각 PC는 Codex 프로필의 플러그인 설정과 hook 신뢰를 관리한다.
