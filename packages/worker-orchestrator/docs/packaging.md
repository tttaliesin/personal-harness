# 독립 설치 패키지

패키지는 Node 기본 모듈만 사용합니다.
설치 루트의 `lib/`는 실행 코드의 상대 import 구조를 유지합니다.
`dist/cli.mjs`는 설치된 `lib/cli/main.mjs`에서 `main`을 가져옵니다.
원본 저장소와 npm 의존성은 실행에 필요하지 않습니다.

`plugin.json`은 Agent Plugins 1.0의 portable manifest입니다.
`skills/`는 portable 형식의 고정된 자동 발견 경로입니다.
`.codex-plugin/plugin.json`은 기존 Codex 클라이언트용 호환 overlay입니다.
두 manifest의 이름·버전·설명·표시 정보는 일치합니다.
별도 app ID와 MCP 의존성은 선언하지 않습니다.

`package-manifest.json`은 버전과 Git revision을 기록합니다.
Git revision을 얻지 못하면 `revision`은 `null`입니다.
`runtime`에는 Node 요구 범위와 빌드에 사용한 버전을 기록합니다.
`files`에는 manifest 자체를 제외한 모든 파일의 SHA-256과 바이트 수를 기록합니다.
해시는 변경 탐지용입니다.
해시는 서명이나 게시자 인증을 대신하지 않습니다.

## 로컬 카탈로그에서 설치하기

저장소 루트에서 빌드하면 `dist/codex/`에 로컬 카탈로그와 설치 패키지가 생성됩니다.
빌더는 `package.json`의 버전을 두 플러그인 매니페스트, 패키지 매니페스트, 설치본 CLI에 기록합니다.

1. Node.js 24 이상에서 `npm run build`를 실행하십시오.
   출력의 `marketplaceRoot`는 카탈로그 경로이고, `packageRoot`는 설치 패키지 경로입니다.
2. `npm run check`를 실행하십시오.
   검사 결과에서 `ok`와 `marketplaceChecked`가 모두 `true`인지 확인하십시오.
3. 카탈로그를 처음 사용하는 경우 `codex plugin marketplace add ./dist/codex`를 실행하십시오.
   `codex plugin marketplace list`에 `worker-orchestrator-local`이 표시되는지 확인하십시오.
4. `codex plugin add worker-orchestrator@worker-orchestrator-local --json`을 실행하십시오.
   출력의 `installedPath`를 확인하십시오.
5. 표시된 설치 경로로 `node "<설치 경로>/dist/cli.mjs" --version`을 실행하십시오.
   출력의 `version`이 `package.json`의 버전과 일치하는지 확인하십시오.

같은 카탈로그 경로를 재사용할 때는 등록 단계를 건너뛰십시오.
변경한 소스를 반영하려면 같은 경로에 다시 빌드한 뒤 플러그인 설치 명령을 다시 실행하십시오.

카탈로그 루트에는 `marketplace.json`과 `.agents/plugins/marketplace.json`이 있습니다.
두 파일은 카탈로그 루트 기준으로 `./worker-orchestrator`를 참조합니다.

## 패키지 검사

설치 루트에서 다음 명령으로 내부 파일·링크·import·manifest와 CLI를 검사합니다.

```text
node <설치 루트>/scripts/check-package.mjs --state-dir <임시 절대 경로>
```

`capabilities`로 설치된 CLI의 시작과 어댑터를 확인합니다.
이어 해당 상태 디렉터리에서 `status`를 실행합니다.
등록되지 않은 프로젝트의 `PROJECT_NOT_FOUND` 응답으로 SQLite 열기·마이그레이션·조회가 완료됐는지 확인합니다.

빌드는 정해진 출력 파일만 덮어씁니다.
이전 파일이나 외부 파일을 재귀 삭제하지 않습니다.
검사기는 manifest에 없는 잔여 파일을 실패로 보고합니다.
소스와 출력의 symlink는 패키지에 포함하지 않습니다.
같은 카탈로그 출력 경로에 대한 빌드는 순차적으로 파일을 기록합니다.
빌드와 같은 카탈로그를 검사할 때는 기록이 끝난 패키지와 카탈로그를 확인합니다.
