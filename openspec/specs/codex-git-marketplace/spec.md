# Codex Git 마켓플레이스

## Purpose

Codex가 Personal Harness의 공개 기본 브랜치에서 플러그인을 찾고 설치하거나 갱신할 수 있게 한다.
플러그인 구성과 훅 신뢰는 설치한 환경에서 관리한다.

## Requirements

### Requirement: Provide the Codex marketplace on the public default branch

공개 기본 브랜치 `main`은 루트의 `.agents/plugins/marketplace.json`에 `personal-harness` 마켓플레이스를 제공해야 한다(MUST).
모든 카탈로그 항목의 `source.path`는 저장소 루트에 대한 상대 경로를 사용해야 한다(MUST).

#### Scenario: 공개 카탈로그에서 배포 원본을 조회

- **WHEN** Codex가 `tttaliesin/personal-harness`의 Git 마켓플레이스를 등록하고 카탈로그를 읽는다.
- **THEN** 다섯 항목의 배포 루트는 다음과 같아야 한다.

| 항목 | 배포 루트 |
| --- | --- |
| `repo-governance` | `./packages/repo-governance/plugin` |
| `windows-agent-devkit` | `./packages/windows-agent-devkit/release` |
| `worker-orchestrator` | `./packages/worker-orchestrator/release` |
| `personal-harness-skills` | `./skills/custom` |
| `personal-harness-adapters` | `./skills/adapters` |

### Requirement: Upgrade through the same marketplace source

게시한 새 버전은 같은 공개 `main`의 마켓플레이스 갱신 경로로 가져올 수 있어야 한다(MUST).
실제 설치와 버전 확인은 대상 Codex 프로필에서 수행해야 한다(MUST).

#### Scenario: 새 버전이 게시된 마켓플레이스 갱신

- **WHEN** 새 버전이 공개 `main`에 게시되고 사용자가 `codex plugin marketplace upgrade personal-harness`로 갱신한다.
- **THEN** Codex는 현재 공개 카탈로그와 배포 파일을 가져온다.
- **AND** 새 세션에서 해당 출처의 설치 버전을 확인할 수 있다.

### Requirement: Manage plugin selection and hook trust in the local profile

플러그인 활성화와 훅 신뢰는 각 설치 환경의 Codex에서 관리해야 한다(MUST).
저장소별 도입 기록과 제품 설정은 플러그인에서 정한 해당 환경의 위치를 사용해야 한다(MUST).

#### Scenario: 이전 로컬 출처에서 전환

- **WHEN** 같은 플러그인의 이전 로컬 출처가 있는 Codex 프로필에 `personal-harness` 출처의 항목을 설치한다.
- **THEN** 사용자는 새 출처의 항목을 확인한 뒤 이전 출처를 끌 수 있다.
- **AND** 호스트에서 훅 검토를 표시하면 사용자가 해당 환경에서 훅의 설정을 검토한다.
- **AND** 도입돼 있는 저장소의 실제 규약 적용 여부는 해당 플러그인이 선택한 로컬 도입과 제품 계약에서 결정한다.

## 근거

[공개 카탈로그](../../../.agents/plugins/marketplace.json) · [등록과 갱신 절차](../../../docs/deployment.md#codex-git-마켓플레이스)
