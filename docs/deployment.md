# 적용과 복구

## 설치 준비

대상 PC에서 Codex를 한 번 실행한다.
저장소 루트에서 `task setup`으로 Python 가상환경과 패키지를 준비한다.
`task plan`으로 현재 상태를 읽는다.
`task plan`과 `task check`는 사용자 홈을 변경하지 않는다.

`task update:plan`은 공식 최신 안정판을 조회한 뒤 설치 계획만 출력한다.
기본 미리보기는 네트워크를 읽지만 파일과 사용자 홈을 쓰지 않는다.
`task install` 또는 `task update`를 실행하면 조회한 배포를 저장소의 `.local`에 설치하고, 선택한 Codex 홈에 플러그인을 등록한다.
공식 스킬 갱신과 설치 검증이 끝나면 실제 설치한 버전·commit·해시를 lock에 기록한다.
이어서 Harness를 적용하고 상태를 확인한다.
Codex CLI는 PATH와 기존 `node_repl` 설정의 `CODEX_CLI_PATH`에서 찾는다.
자동으로 찾지 못하면 `task install -- -Codex 'D:/tools/codex.exe'`로 지정한다.
`task install -- -CodexHome 'D:/Test Codex'`로 별도 프로필에 먼저 설치할 수도 있다.

Ego와 번들 스킬은 브라우저가 관리한다.
이 저장소의 설치·사전 검사·적용 대상에 포함하지 않는다.

```toml
[paths]
agent_desktop = "D:/tools/agent-desktop.exe"
codegraph = "D:/tools/codegraph.cmd"
```

`${USERPROFILE}`, `${CODEX_HOME}`, `${REPO_ROOT}`만 치환한다.
상대경로는 이 저장소를 기준으로 해석한다.
`task plan -- -HomeDirectory 'D:/Test Profile'`은 해당 사용자 홈을 대상으로 하며, 실제 `CODEX_HOME` 환경변수를 자동으로 끌어오지 않는다.
사용자 홈과 다른 Codex 홈을 함께 사용할 때는 `-CodexHome`도 지정한다.
다른 PC 프로필을 확인할 때는 `task plan HOST=roylabs-desktop`처럼 호스트를 지정한다.

## 적용 절차

1. `task plan`으로 공통 키의 변경 값과 파일 목록을 확인한다.
2. 누락된 도구와 충돌한 로컬 구성을 정리한다.
3. `task apply`를 실행한다.
4. `task check`로 변경할 파일이 남지 않았는지 확인한다.
5. Codex 재시작 후 새 채팅에서 사용자 지침, 스킬, MCP, 플러그인 표시를 확인한다.

사전 검사에서 누락된 항목이 있으면 `apply`는 파일을 쓰지 않는다.
관리 대상 파일이 링크나 Junction을 통해 다른 위치를 가리키면 적용을 중단한다.
계획 이후 바뀐 파일도 덮어쓰지 않는다.
쓰기 실패 시 이번 적용에서 쓴 파일은 이전 내용으로 되돌리고 백업은 유지한다.

새 공식 스킬에서 삭제된 파일은 이전 적용 기록의 SHA256과 현재 내용이 일치할 때만 정리한다.
사용자가 수정하거나 추가한 파일이 있으면 해당 파일을 보존하고 적용을 중단한다.
공식 소스의 파일과 디렉터리 형태가 충돌하면 소스에 쓰기 전에 중단한다.

설정 파일의 주석과 명시하지 않은 항목은 TOML 편집기로 유지한다.
`skills.config`는 이름 또는 경로가 같은 항목만 갱신한다.
기존 사용자 스킬 선택 목록 전체를 교체하지 않는다.
현재 존재하는 파일과 충돌한 경우에는 적용 전에 백업이 만들어진다.

| 명령 | 정상 종료 | 차이 또는 누락 | 실행·입력 오류 |
|---|---:|---:|---:|
| `plan` | `0` | 의존성 누락 `2` | `2` |
| `check` | `0` | `1` | `2` |
| `apply` | `0` | 사전 검사 실패 `2` | `2` |

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

GitHub 릴리스는 draft와 prerelease를 제외한 공식 최신 안정판을 사용한다.
플러그인 버전이 같아도 릴리스의 commit이 바뀌면 실제 소스를 갱신한다.
버전이 바뀌면 기존 marketplace 등록을 공식 CLI로 제거하고 새 revision으로 등록한다.
브라우저 소유의 Ego와 번들 스킬에는 이 절차를 적용하지 않는다.

플러그인 설치 프로세스에서만 Git의 `core.autocrlf=false`와 `core.eol=lf`를 사용한다.
PC의 전역 Git 설정은 유지한다.
기존 플러그인 캐시가 선택한 공식 commit의 내용과 다르면 marketplace를 공식 CLI로 재등록한 뒤 다시 설치한다.
재설치한 파일의 해시도 일치해야 설치 완료를 기록한다.

기록한 버전을 다시 설치하려면 `task install -- -Locked`를 사용한다.
최신 metadata 조회를 생략하지만 배포물이 로컬에 없으면 다운로드는 필요하다.
`task apply`의 파일 백업은 의존성 설치 전체를 되돌리는 기능이 아니다.
설치 실패 시 기록된 lock과 오류를 확인하고 같은 명령을 다시 실행한다.

## Homelab 적용 결과

2026년 11월 12일 10:52 KST에 실제 Homelab 사용자 프로필에 적용했다.
설정 파일 1개, 전역 지침 1개, 스킬 파일 11개로 총 13개를 반영했다.
Ego 스킬 Junction은 공식 앱 설치 과정에서 생성되어 기존 연결을 사용했다.
적용 직후와 최종 검증의 `check` 결과는 모두 **변경 파일 0개, 링크 0개, 누락 의존성 0개**다.

| 구성 | 적용값과 실행 확인 |
|---|---|
| Codex 모델 / 추론 | `gpt-6.1-sol` / `max`, 기존 로컬 모델 카탈로그에 모델 존재 확인 |
| agent-desktop | `1.0.2`, 배포물·실행 파일 SHA256과 실제 버전 확인 |
| CodeGraph | `1.6.2`, 실제 MCP 초기화와 `codegraph_explore` 도구 조회 성공 |
| pstack | `0.9.136`, 고정 marketplace revision과 설치 manifest 확인 |
| EGM | `0.1.1`, 고정 marketplace revision과 설치 manifest 확인 |
| Ego lite | `0.6.2.10`, Citro Labs의 유효한 서명을 확인한 공식 Windows 설치 파일 사용 |
| ego-browser | `0.6.2.10`, 빈 작업 공간 생성과 종료로 브라우저 연결 확인 |

이 절은 2026년 11월 12일의 최초 적용 기록이다.
당시 함께 설치한 Ego와 번들 스킬은 이후 저장소의 관리 대상에서 제외했다.
브라우저가 만든 기존 앱·스킬·링크는 유지한다.

적용 전후에 `node_repl`, `notify`, OpenCodex, OpenAI 번들 marketplace 경로, 프로젝트 신뢰와 앱 권한이 보존된 것을 확인했다.
스킬 파일 11개도 Roylabs 원본의 SHA256과 일치한다.
pstack hook 신뢰는 해당 PC에서 생성된 로컬 기록을 사용한다.

PC 경로와 적용 기록은 Git에서 제외되는 `.local/homelab-desktop.toml`과 `.local/homelab-apply-receipt.json`에 있다.
의존성 설치 전 백업은 Codex 홈의 `harness-backups/preinstall-20261112T014616.596842Z`, 공통 파일 적용 전 백업은 `harness-backups/20261112T015206.425721Z`에 있다.

새 플러그인과 스킬을 사용할 때는 Codex를 다시 열어 목록을 갱신한다.
모델 응답, pstack·EGM 전체 작업 실행과 사이트 로그인 상태는 이번 검증에 포함하지 않았다.

## 구현 검증 결과

2026년 11월 12일 검증 결과다.

- 자동 테스트 50개 중 49개 통과. 파일 심볼릭 링크 테스트 1개는 Windows 권한 제약으로 제외했다.
- Junction 경로 보호 테스트는 실제 Junction을 생성해 통과했다.
- 실제 Homelab 설정을 작업공간의 임시 프로필로 복사해 파일 13개와 Ego Junction을 적용했다.
- 같은 임시 프로필의 두 번째 계획에서 변경 파일과 링크는 0개였다.
- 앱 런타임, OpenCodex 설정, 로컬 marketplace 경로, 프로젝트 신뢰와 원본 백업이 보존됐다.
- 스킬 원본 11개의 SHA256과 지침의 경로 치환 결과를 Roylabs 원본 기록에 대조했다.
- 의존성 설치 미리보기와 PowerShell 구문 검증을 통과했다.

위 구현 테스트의 임시 프로필에는 의존성의 존재를 모사한 파일을 사용했다.
이후 실제 의존성 설치와 사용자 홈 적용을 수행한 결과는 앞의 Homelab 적용 결과에 기록했다.

## 2026년 11월 13일 최신 갱신 결과

2026년 11월 13일 10:44 KST에 `update-dependencies.ps1 -Install`로 실제 Homelab 프로필의 갱신을 완료했다.
공식 최신 안정판 조회, 의존성 설치, 공통 스킬 적용과 `check`가 모두 종료 코드 `0`으로 끝났다.

| 구성 | 설치 결과 |
|---|---|
| pstack | `0.9.138`, commit `2044f1810afc98c3aa80100587dd990c83cf6ea8` |
| EGM | `0.1.1`, 공식 안정 릴리스 commit `dea7761de06ce5b51c177ebb9bba0469f24af5a4` |
| agent-desktop | `1.3.0`, 실제 실행 파일의 버전과 SHA256 확인 |
| CodeGraph | `1.6.2`, 실제 CLI 버전과 npm integrity 확인 |

공식 agent-desktop 스킬 파일 10개와 라이선스의 해시를 새 lock에 기록했다.
저장소의 공식 원본과 배포한 스킬의 해시가 모두 일치했다.
이 중 내용이 바뀐 스킬 파일 8개를 실제 프로필에 적용했다.
적용 후 `check`는 **변경 파일 0개, 누락 의존성 0개**였다.

pstack과 EGM 설치 파일 전체의 내용도 선택한 공식 commit의 fingerprint와 일치했다.
두 관리 대상 marketplace 등록을 제외한 Codex 설정 전체가 적용 전과 같았다.
Ego 스킬과 링크의 내용, 연결 대상과 수정 시각도 적용 전과 같았다.
PC의 전역 Git `core.autocrlf=true`는 그대로 유지됐다.

전체 자동 테스트 75개 중 74개가 통과했다.
파일 심볼릭 링크 테스트 1개는 Windows 권한 제약으로 제외했다.
실제 Junction 경로 보호 테스트는 통과했다.
캐시 복구 수정은 독립 검토와 별도 회귀 테스트 19개를 통과했다.

설치 전 백업은 Codex 홈의 `harness-backups/preupdate-20261113T013011.363225Z`에 있다.
스킬 적용 백업은 `harness-backups/20261113T014434.170633Z`에 있다.
PC의 비교 기록은 Git에서 제외되는 `.local/homelab-latest-update-receipt.json`에 있다.
이 갱신은 Homelab에서 실행했으며 Roylabs의 실제 프로필은 이번 실행으로 변경하지 않았다.

## 루트 Task 명령 검증 결과

2026년 11월 13일 Task `3.54.0`으로 루트 명령을 검증했다.
실제 Homelab의 `task plan`과 `task check`는 변경 파일 0개, 누락 의존성 0개였다.
하위 `docs` 폴더에서 실행한 `task check`도 같은 결과였다.
`task test`는 79개 중 78개가 통과했고, Windows 권한 제약으로 파일 심볼릭 링크 테스트 1개를 제외했다.

추가한 테스트는 임시 스크립트로 대상 프로필과 특수문자가 있는 경로의 전달, 설치·미리보기 구분과 실패 코드를 확인했다.
임시 폴더의 `task setup`은 가상환경 생성과 해당 환경의 pip 실행을 통과했다.
설치·갱신 명령은 이 검증에서 실제 프로필에 다시 적용하지 않았다.
