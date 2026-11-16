# Taste Skill 원본 적용 결과

2026년 11월 16일 공식 Taste Skill 2.5.1을 두 PC에 설치했다.
공식 Codex 플러그인의 원본 전체를 설치하고 공통 사용자 지침에 작업 목적에 따른 선택 기준을 추가했다.

## 원본과 등록

| 항목 | 확인 값 |
|---|---|
| 저장소 | `https://github.com/Leonxlnx/taste-skill.git` |
| 플러그인 | `taste-skill@taste-skill` |
| 런타임 스킬 이름 | `taste-skill:design-taste-frontend` |
| 안정 릴리스 | 2.5.1 |
| 원본 commit | `f6b76575f949707b4e3c37cd86cb44b0b98643e8` |
| 전체 원본 digest | `39704efa1ccf7833cb9eefca3879346c247926c65097a9d4e1216ce7d9f2b5c5` |
| 원본 파일 | Git 내부 파일을 제외한 1,663개 |

`registry.toml`은 공식 최신 안정 릴리스를 갱신 기준으로 사용한다.
lock에는 정확한 commit과 전체 원본 digest를 기록했다.
설치기는 원본 스킬·참조·스크립트·에셋·MIT 라이선스를 수정하지 않았다.
선택 기준과 기존 프로젝트 보존 조건은 원본 밖의 공통 사용자 지침에서 관리한다.

## 실제 PC 검증

| 확인 항목 | Homelab Desktop | Roylabs Desktop |
|---|---|---|
| 공식 CLI 설치와 활성화 | 성공 | 성공 |
| 전체 원본 digest | 공식 commit과 일치 | 공식 commit과 일치 |
| 새 Codex 런타임의 스킬 로딩 | 활성 상태 1개 | 활성 상태 1개 |
| Taste 스킬 로딩 오류 | 0 | 0 |
| 발견된 Taste 자동 hook | 0 | 0 |
| 원본 문구 검사 | 종료 코드 0 | 종료 코드 0 |
| 원본 headless 브라우저 캡처 | 종료 코드 0 | 종료 코드 0 |
| 임시 페이지와 브라우저 프로필 | 정리 완료 | 정리 완료 |

Codex의 `skills/list`와 `hooks/list`로 로딩 결과를 확인했다.
이 조회는 모델 턴을 시작하지 않았다.
원본의 스킬 설명은 자동 선택이 가능한 상태이며 공통 지침에도 명시적 호출이 필요 없다고 기록했다.

브라우저 확인은 기존 프로젝트 밖의 임시 HTML에 원본 `shoot.mjs`를 실행했다.
두 PC 모두 390×300 PNG를 생성했다.
이 확인은 원본 도구의 실행 가능성을 검증하며 실제 사이트 디자인 품질을 평가한 것은 아니다.

## 보존 범위

두 PC에서 Taste 플러그인·marketplace 등록을 제외한 기존 설정 값이 동일했다.
기존 hook 설정과 신뢰 기록이 동일했다.
Roylabs의 repo-governance와 hook 관련 보존 대상 원본 파일 79개의 해시가 동일했다.
PC별 실행 경로 덮어쓰기는 유지했다.
기존 프로젝트의 소스와 스택은 수정하지 않았다.
CodeGraph, OpenSpec와 agent-desktop의 기존 버전도 유지했다.

두 PC의 사용자 지침 SHA256은 `bc82aba8805b88bf0a8bf368aa4fdf6d17ef1a5561d428201cdd5a9170ba21e9`로 일치했다.
원본 스킬 SHA256은 `0c7a5852a5217be79cab422c6d58329b776f0c25bd6da8a7a01707ce75be6206`으로 일치했다.

## 프로젝트 검증

`task test`는 281개 테스트를 실행해 성공했다.
환경 조건에 따른 2개 테스트는 건너뛰었다.
원본 플러그인을 임시 Codex 프로필에 먼저 설치해 전체 digest와 기존 설정 보존을 확인했다.
locked 재해석은 추가 메타데이터 조회 없이 같은 lock을 반환했다.
Homelab의 실제 관리 상태에 대한 `task check`는 변경 0개와 누락 의존성 0개를 반환했다.
OpenSpec strict validation은 변경 명세에 issue가 없다고 반환했다.

## 확인의 한계

설치, 원본 무결성, 스킬 로딩과 원본 스크립트 실행을 확인했다.
자연어 요청마다 모델이 스킬을 선택하는 비율이나 개발 품질·완료 시간의 개선은 측정하지 않았다.
공통 지침은 기존 프로젝트의 프레임워크·SSR·API·인증·데이터 흐름과 배포 경로를 유지하도록 한다.
향후 실제 디자인 작업에서 이 경계와 결과를 함께 확인한다.
