# Tasks

## 1. 원본과 공개 배포 기준 확인

- [x] 1.1 원본 `2ccf5538f6ebfd6c0179c9467ae53c10a18f76d4`의 설계와 검증 기록을 확인한다.
  `design.md`에 초기 구현 의도, `04861ef`의 읽기 전용 전환과 원본 문서의 커밋 링크를 기록했다.
- [x] 1.2 공개 `0.3.5`의 매니페스트, 스킬, 번들과 수집기를 소스 및 테스트와 대조한다.
  Git blob 39개 일치, 개발용 검사 스크립트 한 개의 차이, 배포 CLI와 원본 앱 검증 기록의 SHA-256 일치를 확인했다.

## 2. 동작 명세와 기존 픽스처 대조

- [x] 2.1 `windows-diagnostic-cli`에 진입점, 공개 옵션, 출력·종료 코드, 유지 사유 조회를 기록한다.
  `cli.test.mjs`와 공개 번들의 도움말·버전·입력 오류로 확인했다.
- [x] 2.2 `windows-project-tool-requirements`에 선언 탐색, 문맥, 언어·패키지 관리자·버전·지원 상태를 기록한다.
  `project.test.mjs`, `project-context.test.mjs`, `versions.test.mjs`, `support.test.mjs`로 비교했다.
- [x] 2.3 `windows-host-observation`에 고정 조회, CIM 대체 수집, 제한 시간과 호스트 도구의 선택 진단을 기록한다.
  `collector-fallback.test.mjs`, `windows.test.mjs`, `query.test.mjs`와 인프라 통합 테스트로 확인했다.
- [x] 2.4 `windows-task-runner-advice`에 실행기 선언·CI와의 연결, 유지·제안·보류의 조건을 기록한다.
  반복 절차의 순서와 GNU Make의 산출물 연결을 바꾸는 `task-runner-report.test.mjs`와 `task-runners.test.mjs`의 사례를 대조했다.
- [x] 2.5 `windows-advanced-diagnostics`에 mise·.NET·Git과 앱·IDE·볼륨·GitHub 인증 조회를 기록한다.
  `advanced.test.mjs`와 앱 설치 목록 사례를 대조하고 공개 번들이 조회하는 마켓플레이스 이름을 확인했다.

## 3. 통합 확인

- [x] 3.1 제안과 다섯 규격의 경로를 대조한다.
  명령 생략을 포함한 `doctor`, 공개 긴 옵션 16개와 `-h`, 점검 ID 30개를 확인했다.
  요구사항 28개와 `WHEN` 및 `THEN`이 있는 시나리오 62개를 확인했다.
  문서의 로컬 링크 대상도 확인했다.
- [x] 3.2 패키지의 기존 `node --test`를 격리한 임시 디렉터리에서 실행한다.
  준비된 동일 버전 의존성 네 개를 재사용했다.
  269개 중 264개가 통과했고 실패는 0개다.
  링크 생성 권한이 필요한 5개를 건너뛰었다.
  CIM 대체 수집 테스트는 통과했다.
- [x] 3.3 저장소 루트의 `npm test`로 공개 배포 경로와 배포본을 확인한다.
  6개가 통과했고 실패는 0개다.
- [x] 3.4 공개 번들의 기본 진단 경로를 확인한다.
  존재하지 않는 상태 경로를 지정한 실행에서 종료 코드 `0`, 고유 점검 ID 30개와 수동 확인 항목 네 개를 관찰했다.
  지정한 상태 경로를 진단 종료 뒤에도 생성하지 않았다.
  공개 번들의 도움말과 버전 조회는 코드 `0`을 반환했다.
  지원하지 않는 명령, 잘못된 제한 시간, 디렉터리가 아닌 프로젝트에는 코드 `2`를 반환했다.
  종료 코드 `1`은 기존 통합 테스트와 원본 앱의 Docker 클라이언트 미탐지 기록에서 확인했다.
- [x] 3.5 OpenSpec 2.0의 `spec-driven` 메타데이터와 변경 산출물을 확인한다.
  `openspec validate define-windows-agent-devkit-behavior --strict --json`으로 규격과 시나리오를 검증했다.
