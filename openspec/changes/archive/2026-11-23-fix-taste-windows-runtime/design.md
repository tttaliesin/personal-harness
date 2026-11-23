# Design

## Context

Taste 2.5.1의 layout checker는 Edge를 기본 목록에서 누락한다.
consistency checker는 Edge 런처의 종료 이벤트를 즉시 시작 실패로 판정한다.
기존 페이지와 원본 검사 파일을 고치지 않는 실행 호환이 필요하다.

## Goals / Non-Goals

**Goals:** 두 Windows PC에서 원본 게이트의 모든 브라우저 검사를 완료한다.
판정과 종료 코드를 유지하고 설치기에서 재현 가능한 소스를 배포한다.

**Non-Goals:** 페이지 디자인 수정, 검사 약화, 원본 플러그인 패치, 전역 환경변수나 새 hook 설정.

## Decisions

저장소 소유 스킬은 원본 Node 스크립트를 자식 프로세스로 실행한다.
브라우저 경로는 기존 CHROME_PATH를 우선하고 없으면 설치된 Chrome·Edge를 찾는다.
자식의 NODE_OPTIONS에만 작은 preload를 더하며 기존 옵션을 보존한다.
preload는 선택한 Edge의 headless spawn에만 재실행 방지 플래그를 추가한다.
ESM의 named spawn에도 같은 프로세스 로컬 보정이 적용된다.
Windows의 중단 이벤트는 전용 IPC로 원본의 신호 핸들러에 전달한다.
IPC 채널은 unref하여 정상 종료를 막지 않으며 10초 미응답 시 자체 자식 프로세스 계열만 정리한다.
원본 캐시를 복사·패치하는 방식은 사용하지 않는다.

## Risks / Trade-offs

Edge 플래그는 현재 두 PC의 실제 브라우저 실행으로 검증한다.
후속 브라우저가 플래그를 지원하지 않으면 원본 실행 오류를 그대로 보고하고 우회 PASS를 만들지 않는다.
Node preload는 이 실행기의 자식에만 한정되며 일반 개발·브라우저 명령에는 설정하지 않는다.
실행 호환 성공 후 원본 게이트가 기존 페이지의 디자인 문제를 새로 발견할 수 있다.
이를 런타임 실패와 구분해 보고한다.
