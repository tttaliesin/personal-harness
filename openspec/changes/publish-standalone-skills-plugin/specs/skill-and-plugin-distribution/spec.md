# Spec Delta

## Purpose

Personal Harness의 단독 스킬을 표준 `skills` CLI와 Codex 마켓플레이스에서 배포한다.
두 설치 경로는 같은 스킬 원본을 사용한다.

## ADDED Requirements

### Requirement: Install the same standalone skills through both distribution paths

저장소는 유지하는 단독 스킬을 표준 `skills` CLI와 Codex 마켓플레이스로 배포해야 한다(MUST).
마켓플레이스에서 자체 스킬과 어댑터를 각각 설치할 수 있어야 한다(MUST).

#### Scenario: 같은 스킬을 CLI와 마켓플레이스에서 설치

- **WHEN** 사용자가 `skills` CLI로 단독 스킬을 선택하거나 Codex에서 해당 스킬의 플러그인을 설치한다.
- **THEN** 두 경로에서 해당 스킬의 같은 `SKILL.md`와 동반 파일을 설치할 수 있다.

#### Scenario: 자체 스킬과 어댑터 중 하나를 설치

- **WHEN** 사용자가 `personal-harness`에서 `personal-harness-skills` 또는 `personal-harness-adapters`를 설치한다.
- **THEN** Codex는 선택한 플러그인에 속한 스킬만 설치하고 해당 플러그인의 버전을 관리한다.
