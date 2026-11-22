# 적용과 복구

## 설치 준비

소스를 직접 받지 않고 설치하려면 [한 명령으로 Harness 설치하기](remote-install.md)를 따른다.
아래 Task 명령은 저장소에서 실행하는 개발·관리 절차다.

대상 PC에서 Codex를 한 번 실행한다.
저장소 루트에서 `task setup`으로 Python 가상환경과 패키지를 준비한다.
`task plan`으로 현재 상태를 읽는다.
`task plan`과 `task check`는 사용자 홈을 변경하지 않는다.

`task update:plan`은 등록한 기준에 따라 최신 의존성과 외부 스킬을 조회한 뒤 설치 계획만 출력한다.
기본 미리보기는 네트워크를 읽지만 파일과 사용자 홈을 쓰지 않는다.
`task install`과 `task update`는 선택한 상태 루트에 도구를 설치한다.
설치기는 등록한 외부 플러그인을 대상 Codex 홈에 등록한다.
설치한 의존성을 검증한 뒤 버전, 커밋, 해시를 `<state-root>/sources/dependencies.lock.json`에 기록한다.
이어서 하네스를 적용하고 상태를 확인한다.

체크아웃의 기본 상태 루트는 Git에서 제외되는 `.local`이다.
[저장소의 잠금 파일](../packages/harness/resources/dependencies/dependencies.lock.json)은 읽기 전용 초기값이다.
상태 루트를 명시하지 않은 체크아웃에 활성 잠금이 없으면 `task plan`, `task check`, `task apply`는 이 초기값을 읽는다.
`-StateRoot`를 명시한 경우에는 세 명령 모두 해당 상태 루트의 활성 잠금을 요구한다.
활성 잠금이 없으면 같은 `-StateRoot`로 `task install`을 실행해 설치 상태를 준비한다.

Codex CLI는 PATH와 기존 `node_repl` 설정의 `CODEX_CLI_PATH`에서 찾는다.
자동으로 찾지 못하면 `task install -- -Codex 'D:/tools/codex.exe'`로 지정한다.
`task install -- -CodexHome 'D:/Test Codex'`로 별도 프로필에 먼저 설치할 수도 있다.

Codex Desktop은 내장 Computer Use를 앱과 함께 설치한다.
Windows 앱 화면을 확인하거나 앱에 직접 입력해야 할 때 Codex는 내장 Computer Use를 선택한다.

Ego와 번들 스킬은 브라우저가 관리한다.
이 저장소의 설치·사전 검사·적용 대상에 포함하지 않는다.

설치된 도구 경로를 직접 지정하려면 [로컬 설정 예시](local.example.toml)의 `[paths]`를 사용한다.
`${USERPROFILE}`, `${CODEX_HOME}`, `${REPO_ROOT}`, `${STATE_ROOT}`를 치환한다.
`${STATE_ROOT}`는 선택한 상태 경로이며, 저장소 기본값은 `.local`이다.
상대경로는 실행 중인 소스 루트를 기준으로 해석한다.
`task plan -- -HomeDirectory 'D:/Test Profile'`은 해당 사용자 홈을 대상으로 하며, 실제 `CODEX_HOME` 환경변수를 자동으로 끌어오지 않는다.
사용자 홈과 다른 Codex 홈을 함께 사용할 때는 `-CodexHome`도 지정한다.
다른 PC의 적용 계획을 확인할 때는 `task plan HOST=roylabs-desktop`처럼 호스트를 지정한다.
지원 대상 PC는 [package.json](../package.json)의 `supportedHosts`에서 확인할 수 있다.

## 적용 절차

1. `task plan`으로 공통 키의 변경 값과 파일 목록을 확인한다.
2. 누락된 도구와 충돌한 로컬 구성을 정리한다.
3. `task apply`를 실행한다.
4. `task check`로 변경할 파일과 보류된 외부 스킬이 있는지 확인한다.
5. Codex 재시작 후 새 채팅에서 사용자 지침, 스킬, MCP, 플러그인 표시를 확인한다.

사전 검사에서 `MISSING` 항목이 있으면 `task apply`는 쓰기 전에 중단한다.
관리 대상 파일이 링크나 Junction을 통해 다른 위치를 가리키면 적용을 중단한다.
계획 이후 바뀐 파일도 덮어쓰지 않는다.
쓰기 실패 시 이번 적용에서 쓴 파일은 이전 내용으로 되돌리고 백업은 유지한다.

설치기는 [registry.toml](../packages/harness/resources/registry.toml)의 `[[skills]]`에서 로컬 스킬의 `path`와 외부 원본의 `source`를 읽는다.
적용할 때 로컬 파일과 캐시의 외부 파일을 `~/.agents/skills/<name>/`에 배치한다.
`requires`를 지정한 스킬은 잠금 파일에 해당 의존성이 있을 때 배포한다. [저장소 구조](../README.md#저장소-구조)
설치기는 등록한 스킬의 원본에서 삭제된 파일을 현재 SHA256이 이전 적용 기록과 일치할 때만 정리한다.
사용자가 수정하거나 추가한 파일이 있으면 해당 파일을 보존하고 적용을 중단한다.
원본과 설치 경로에서 파일과 디렉터리의 형태가 충돌하면 쓰기 전에 적용을 중단한다.

`task plan`과 `task apply`는 캐시에서 누락된 외부 스킬을 보류한다.
현재 등록과 맞지 않거나 검증에 실패한 캐시 항목도 보류한다.
캐시 파일 전체를 읽을 수 없으면 해당 캐시가 필요한 모든 스킬을 보류한다.
출력에서 `DEFERRED` 줄을 보면 보류 사유를 확인할 수 있다.
`task apply`는 다른 사전 검사를 통과하면 공통 파일과 배포 가능한 나머지 스킬을 적용한다.
설치기는 보류한 스킬의 기존 설치 파일을 보존한다.

`task check`는 보류 사유를 표시하고 0이 아닌 종료 코드를 반환한다.

설정 파일의 주석과 명시하지 않은 항목은 TOML 편집기로 유지한다.
`skills.config`는 이름 또는 경로가 같은 항목만 갱신한다.
적용 계획은 이전 하네스가 남긴 데스크톱 스킬 선택과 `computer-use` 비활성 항목을 제거한다.
기존 사용자 스킬 선택 목록 전체를 교체하지 않는다.
현재 존재하는 파일과 충돌한 경우에는 적용 전에 백업이 만들어진다.

모델과 추론 수준은 기존 `config.toml`의 `model`과 `model_reasoning_effort` 값을 유지한다.
입력 제안도 기존 `desktop.composer-predictions-enabled` 값을 사용한다.
PC별 TOML에서 명시할 때는 모델과 추론 수준을 `[config]`에 적는다.
입력 제안은 `[config.desktop]`에 적는다.
해당 키를 지정하면 로컬 TOML의 값이 우선한다.

| 명령 | 정상 종료 | 차이 또는 누락 | 실행·입력 오류 |
|---|---:|---:|---:|
| `plan` | `0` · 외부 스킬 보류만 있어도 `0` | 의존성 누락 `2` | `2` |
| `check` | `0` | 변경, 누락 또는 외부 스킬 보류 `1` | `2` |
| `apply` | `0` · 외부 스킬 보류만 있어도 `0` | 사전 검사 실패 `2` | `2` |

이 표는 `task --exit-code plan`처럼 내부 명령의 종료 코드를 그대로 반환할 때의 값이다.
기본 Task 실행도 내부 명령이 실패하면 0이 아닌 종료 코드를 반환한다.

## 백업과 복구

백업은 적용 대상 Codex 홈의 `harness-backups/<UTC 시각>/`에 생성한다.
`manifest.json`은 원래 경로, 백업 파일 이름과 설치한 내용의 SHA256을 기록한다.
기존 파일이 없던 경로는 `backup: null`로 기록된다.
삭제한 파일은 `installed_sha256: null`로 기록된다.
완료한 적용은 `status: applied`로 기록된다.
백업은 전체 설정을 포함할 수 있으므로 해당 PC에 보관한다.

복구할 때는 Codex를 종료하고 백업의 `manifest.json`과 현재 파일을 확인한다.
각 파일의 현재 SHA256이 기록된 `installed_sha256`과 같은지 확인한 뒤 원본 `.bak`을 해당 경로에 복사한다.
`installed_sha256: null`이면 대상 파일이 없는지 확인한 뒤 원본 `.bak`을 복원한다.
`backup: null`인 파일은 이번 적용에서 새로 만든 파일이므로 필요할 때 그 파일만 제거한다.

공통 원본과 로컬 덮어쓰기가 남아 있으면 다음 `apply`가 같은 설정을 다시 적용한다.
지속적으로 다른 설정을 쓰려면 해당 PC의 `.local` 덮어쓰기를 수정한다.

## 명령 실행 시 최신 갱신

`task update:plan`은 최신 버전 조회 결과를 미리 보여준다.
`task update`는 의존성 설치, Harness 적용, 상태 확인을 차례로 실행한다.
갱신 중 실패하면 뒤 단계로 진행하지 않는다.
최신 버전 확인은 이 명령이나 설치 명령을 실행할 때 수행하며, 예약 작업은 생성하지 않는다.

공통 설치기가 GitHub 릴리스에서 가져오는 의존성은 draft와 prerelease를 제외한 공식 최신 안정판을 사용한다.
플러그인 버전이 같아도 릴리스의 commit이 바뀌면 실제 소스를 갱신한다.
버전이 바뀌면 기존 marketplace 등록을 공식 CLI로 제거하고 새 revision으로 등록한다.
브라우저 소유의 Ego와 번들 스킬에는 이 절차를 적용하지 않는다.

플러그인 설치 프로세스에서만 Git의 `core.autocrlf=false`와 `core.eol=lf`를 사용한다.
PC의 전역 Git 설정은 유지한다.
기존 플러그인 캐시가 선택한 공식 commit의 내용과 다르면 marketplace를 공식 CLI로 재등록한 뒤 다시 설치한다.
재설치한 파일의 해시도 일치해야 설치 완료를 기록한다.

외부 스킬의 캐시를 갱신하려면 일반 설치나 갱신을 실행한다.
설치기는 모든 외부 파일을 검증한 뒤 선택한 커밋과 파일 내용을 담은 캐시를 원자적으로 교체한다.
외부 원본 조회, 다운로드 또는 파일 검증에 실패하면 이전 캐시를 보존한다.
체크아웃의 기본 캐시는 `.local/external-skills.json`이다.
상태 루트를 지정한 경우에는 `<state-root>/external-skills.json`을 쓴다.

`task plan`, `task check`, `task apply`는 외부 스킬을 캐시에서 오프라인으로 읽는다.
기록한 버전을 다시 설치하려면 `task install -- -Locked`를 사용한다.
잠금 모드는 외부 스킬을 현재 등록과 호환되는 기존 캐시에서 읽는다.
필요한 캐시가 없거나 현재 등록과 다르면 잠금 설치는 실패한다.
다른 의존성은 잠금에 기록한 배포물이 로컬에 없으면 다운로드한다.

`task apply`의 파일 백업은 의존성 설치 전체를 되돌리는 기능이 아니다.
설치 실패 시 기록된 lock과 오류를 확인하고 같은 명령을 다시 실행한다.

## Codex Git 마켓플레이스

Codex는 공개 `main`의 [.agents/plugins/marketplace.json](../.agents/plugins/marketplace.json)에서 `personal-harness`를 읽는다.
[자체 플러그인 설치](../README.md#자체-플러그인-설치)의 네 명령을 대상 PC에서 실행한다.
공통 설치기는 계속 공통 설정과 단독 스킬, 등록한 외부 의존성을 관리한다.

Windows Agent Devkit과 Worker Orchestrator는 Node.js 24 이상에서 실행한다.
PC의 기본 Node.js가 이전 버전이면 호환되는 기존 실행 파일을 사용한다. [Windows Agent Devkit 요구 사항](../packages/windows-agent-devkit/package.json) · [Worker Orchestrator 요구 사항](../packages/worker-orchestrator/package.json)

### 기존 로컬 설치 전환

이전 로컬 TOML의 `[plugin_bundles]`에 세 마켓플레이스의 경로가 남아 있어도 공통 설치기는 해당 경로를 건너뛴다.
Codex 프로필에는 기존 로컬 등록과 새 Git 등록이 함께 남을 수 있다.
기존 로컬 설치를 사용한 PC에서 다음 전환을 한 번 수행한다.

1. `personal-harness`의 플러그인 세 개를 설치한다.
2. Codex의 플러그인 목록에서 `personal-harness` 출처의 세 항목이 활성 상태인지 확인한다.
3. 같은 플러그인의 이전 로컬 출처 항목을 끈다.
   이전 출처는 `repo-governance-local`, `windows-agent-devkit-local`, `worker-orchestrator-local`이다.
4. Codex를 다시 열고 새 채팅에서 플러그인과 스킬을 확인한다.

플러그인 설정과 hook 신뢰는 해당 PC의 Codex 프로필에서 관리한다.
Codex가 hook 검토를 요청하면 해당 PC에서 확인한다.
`repo-governance`의 제품별 설정은 해당 작업트리에서 `task bind:product`로 연결한다. [제품 설정 연결 절차](../packages/repo-governance/plugin/skills/repo-governance/references/repository-policy.md)

### PC에서 갱신

새 배포본이 공개 `main`에 올라오면 다음 명령으로 마켓플레이스를 갱신한다.

```powershell
codex plugin marketplace upgrade personal-harness
```

Codex를 다시 열고 플러그인 목록에서 설치한 버전을 확인한다. [OpenAI 마켓플레이스 안내](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)

## 자체 플러그인 소스와 배포본

플러그인의 소스와 테스트는 각 `packages/<name>/`에 함께 둔다.
카탈로그의 `source.path`는 저장소 루트를 기준으로 해석한다.

| 소스 | 이관한 소스 버전 | 이관 기준 커밋 | 카탈로그의 배포 경로 | 첫 게시 버전 |
|---|---|---|---|---|
| [repo-governance](../packages/repo-governance) | `0.2.0` | `441a74e4334d1240319ce635e10cc3c6062a4825` | `./packages/repo-governance/plugin` | `0.2.0` |
| [Windows Agent Devkit](../packages/windows-agent-devkit) | `0.3.5` | `2ccf5538f6ebfd6c0179c9467ae53c10a18f76d4` | `./packages/windows-agent-devkit/release` | `0.3.5` |
| [Worker Orchestrator](../packages/worker-orchestrator) | `0.1.7-local.1` | `7b2d76691bd677f72aaa63f5f674d8eb7ac2d79b` | `./packages/worker-orchestrator/release` | `0.1.6` |

`repo-governance`는 공개용으로 정리한 `main`의 공용 `plugin/`을 배포한다.
개인용 카탈로그와 개인·조직별 설정은 각 환경에서 관리한다.

두 `release/`는 해당 플러그인의 기존 공개 배포본을 바이트 단위로 유지한다.
Windows Agent Devkit `0.3.5`의 공개 배포본은 이전 배포본의 `docs/roadmap.md`에 있던 개인 WSL 작업 경로 한 곳을 가렸다.
실행 파일을 포함한 나머지 파일은 이전 배포본과 바이트가 같다.

Worker Orchestrator `0.1.6`의 파일 목록과 파일별 SHA-256은 승인한 기존 배포본과 일치한다.
이 배포본의 매니페스트에 기록된 커밋은 `7ef027ac9be7c9e175c17657b1a0fb1f9a3f0f62`다.
Worker Orchestrator의 `0.1.7-local.1`은 별도 개발 버전이다.

이전 `bundle_sha256`은 로컬 마켓플레이스의 카탈로그를 포함한 번들 전체의 등록값이다.
공개 해시는 첫 게시 시점에 카탈로그가 가리키는 플러그인 디렉터리에서 계산한 값이다.

| 첫 게시 대상 | 이전 로컬 번들 `bundle_sha256` | 공개 배포 디렉터리 SHA-256 |
|---|---|---|
| Windows Agent Devkit `0.3.5` | `5ae22630f461a94b5a15f8fb9ab1c6de92d2e7c84bdb34eaa378b3e4ddc7f092` | `6211565cdc8eafdec3e69e4c947b09953f4680b875278bc8e8c423d21d489b09` |
| Worker Orchestrator `0.1.6` | `d6e809c0fbb692a218275b7f457e30abb7fb0d63c5c327b9a68cfa4dbd6633d4` | `82b8843c95ac705494684618c7fbc29ecbb2705226c5f976ab5890389ed9435e` |

해시 계산에는 숨김 파일을 포함한 모든 일반 파일의 상대 경로와 파일별 SHA-256을 사용한다.
`/`로 구분한 경로를 정렬하고 공백 없는 ASCII 이스케이프 JSON을 만든 뒤 그 UTF-8 바이트를 SHA-256으로 해시한다.
두 공개 배포 경로의 줄 끝 변환은 `.gitattributes`에서 끈다.

### 새 버전 게시

플러그인의 버전을 올릴 때는 해당 소스 디렉터리에서 `npm test`와 아래 명령을 실행한다.

| 소스 | 배포본 생성과 검사 |
|---|---|
| Windows Agent Devkit | `npm ci --ignore-scripts`, `npm run build`, `npm run package`, `npm run check -- --packaged` |
| Worker Orchestrator | `npm run build`, `npm run check` |
| repo-governance | `npm run bundle:build`, `npm run verify:bundle`, `task package DEST=../../.local/artifacts/repo-governance-runtime` |

`repo-governance`를 패키징할 때는 출력 경로의 상위 폴더인 `.local/artifacts`를 먼저 준비한다.
`DEST`는 아직 존재하지 않는 폴더를 지정한다. [패키징 명령](../packages/repo-governance/Taskfile.yml)

1. 표의 배포 경로에 새 버전을 준비한다.
   Windows Agent Devkit은 `npm run package`가 출력한 `directory`의 내용으로 교체한다.
   Worker Orchestrator는 `dist/codex/worker-orchestrator/`의 내용으로 교체한다.
   `repo-governance`는 카탈로그가 가리키는 공용 `plugin/`에서 갱신한다.
2. 배포 경로의 플러그인 이름과 버전을 확인한다.
3. 임시 Codex 프로필에서 마켓플레이스 등록과 새 버전 설치를 확인한다.
4. 해당 배포 경로와 관련 소스 변경을 같은 공개 `main`에 올린다.
5. 대상 PC에서 Codex 마켓플레이스를 갱신한다.
