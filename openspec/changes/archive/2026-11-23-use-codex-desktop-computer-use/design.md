# Design

## Context

공통 설치기가 Vercel 실행 파일과 두 스킬을 관리한다.
Codex Desktop은 공식 Computer Use를 플러그인으로 제공하며 앱 권한을 PC별로 관리한다.

## Goals / Non-Goals

**Goals**

- Windows 앱의 화면이나 입력이 필요한 작업에서 공식 Computer Use를 선택한다.
- 신규 설치와 갱신에서 Vercel 실행 파일과 스킬을 제외한다.
- 두 PC의 기존 설치 파일과 오래된 선택 설정을 정리한다.

**Non-Goals**

- 앱 권한, `repo-governance`, 브라우저 선택 기준은 각 설정의 기존 관리 주체가 관리한다.

## Decisions

공통 설정은 공식 플러그인을 활성 상태로 둔다.
적용 계획은 예전 공통 설정이 남긴 스킬 항목을 걷어낸다.
설치기는 현재 저장소의 스킬을 배포하고 남은 의존성만 검사한다.
실제 PC의 이전 파일과 설정은 대상 경로를 확인한 뒤 백업하면서 정리한다.

## Risks / Trade-offs

Windows의 공식 Computer Use는 앱 입력에 포그라운드를 사용한다.
앱 사용 권한은 Codex Desktop에서 관리한다.
