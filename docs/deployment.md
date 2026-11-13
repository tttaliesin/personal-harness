# 적용과 복구

## 설치 준비

소스를 직접 받지 않고 설치하려면 [한 명령으로 Harness 설치하기](remote-install.md)를 따른다.
아래 Task 명령은 저장소에서 실행하는 개발·관리 절차다.

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

`${USERPROFILE}`, `${CODEX_HOME}`, `${REPO_ROOT}`, `${STATE_ROOT}`를 치환한다.
`${STATE_ROOT}`는 선택한 상태 경로이며, 저장소 기본값은 `.local`이다.
상대경로는 실행 중인 소스 루트를 기준으로 해석한다.
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
