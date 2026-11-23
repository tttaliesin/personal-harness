# Frontend design skill

## Purpose

웹사이트 제작과 시각 디자인에 원본 Taste Skill을 활용한다.
기존 프로젝트를 다룰 때는 해당 프로젝트의 구조와 개발 규칙을 따른다.

## Requirements

### Requirement: Autonomous design selection

에이전트는 웹사이트 제작, 시각 디자인, 리디자인 또는 시각적 완성도 개선에 적합할 때 원본 Taste Skill의 `design-taste-frontend`를 자율적으로 선택해야 한다(MUST).
에이전트는 원본 플러그인과 캐시를 그대로 사용해야 한다(MUST).
Site 생성과 게시는 사용자가 요청한 호스팅과 배포 범위에 한정해야 한다(MUST).
Windows에서 Taste 브라우저 검사를 실행할 때는 Windows 실행 명세를 따라야 한다(MUST). [Taste Windows runtime](../taste-windows-runtime/spec.md)

#### Scenario: Request a site design

- **WHEN** 사용자가 스킬 이름 없이 Taste Skill에 적합한 사이트 디자인이나 시각 개선을 요청한다.
- **THEN** 에이전트는 원본 `design-taste-frontend`를 선택한다.

#### Scenario: 기존 사이트의 시각 개선

- **WHEN** 사용자가 기존 저장소에서 시각 개선만 요청한다.
- **THEN** 에이전트는 기존 체크아웃과 프로젝트의 개발 흐름에서 작업한다.

### Requirement: Preserve existing project architecture

기존 프로젝트에서는 프레임워크, 렌더링 방식, API, 인증, 데이터 흐름, 컴포넌트와 디자인 토큰, 배포 경로 및 repo-governance를 따라야 한다(MUST).
스킬의 기본값이 프로젝트 제약과 맞지 않으면 사용자 요청과 프로젝트의 제약을 우선해야 한다(MUST).

#### Scenario: Work on a server-rendered application

- **GIVEN** 기존 Next.js 앱이 서버 렌더링과 서버 API를 사용한다.
- **WHEN** 에이전트가 Taste Skill로 화면을 개선한다.
- **THEN** 에이전트는 서버 렌더링과 기존 애플리케이션 인터페이스를 유지한다.
