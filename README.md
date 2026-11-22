# Personal Harness

여러 에이전트에서 쓰는 단독 스킬과 Codex용 자체 플러그인을 배포한다.

[스킬 설치](#단독-스킬-설치) · [플러그인 설치](#자체-플러그인-설치) · [플러그인 배포와 해시](docs/deployment.md)

## 단독 스킬 설치

대상 프로젝트의 루트에서 다음 명령을 실행한다.

```bash
npx skills@latest add https://github.com/tttaliesin/personal-harness/tree/main/skills -a codex
```

기본 설치 위치는 프로젝트의 `.agents/skills/`다.
Claude Code용으로 설치하려면 `-a claude-code`를 지정한다.
사용자 범위인 `~/.agents/skills/`에 설치하려면 `-g`를 붙인다.
특정 스킬만 설치하려면 `--skill create-readme`처럼 이름을 지정한다.
설치할 수 있는 스킬 목록은 `--list`로 확인한다. [skills CLI 명령](https://github.com/vercel-labs/skills/blob/main/docs/commands.md)

| 원본 경로 | 역할 | 스킬 |
|---|---|---|
| [skills/custom/](skills/custom/) | 이 저장소에서 유지하는 자체 스킬 | `create-readme`, `development-environment`, `korean-typography`, `repository-artifacts` |
| [skills/adapters/](skills/adapters/) | 외부 도구와 규격을 연결하는 어댑터 | `humanize-windows-runtime`, `openspec-workflow`, `ste-ko`, `taste-windows-runtime` |

어댑터에 필요한 도구와 규격은 [어댑터 사용](docs/development-tools.md#어댑터-사용)에서 확인한다.

## 자체 플러그인 설치

Codex는 공개 기본 브랜치 `main`의 [마켓플레이스 카탈로그](.agents/plugins/marketplace.json)를 읽는다.
Windows Agent Devkit과 Worker Orchestrator를 실행하려면 Node.js 24 이상이 필요하다.

```bash
codex plugin marketplace add tttaliesin/personal-harness
codex plugin add repo-governance@personal-harness
codex plugin add windows-agent-devkit@personal-harness
codex plugin add worker-orchestrator@personal-harness
```

설치 후 Codex Desktop을 다시 열거나 터미널에서 `codex`로 새 세션을 시작한다.
플러그인 목록에서 `personal-harness` 출처를 확인한다.
[기존 설치 전환과 갱신](docs/deployment.md#codex-git-마켓플레이스)

## 외부 리소스

[external-resources.toml](external-resources.toml)은 외부 스킬, 참조 문서, 플러그인, MCP 서버와 CLI의 출처를 기록한다.
각 리소스는 원본의 설치와 갱신 절차를 따른다. [외부 리소스 안내](docs/development-tools.md)

## 저장소 검증

저장소 루트에서 테스트를 실행한다.

```bash
npm test
```

플러그인별 배포본을 만들고 확인하는 명령은 [새 버전 게시](docs/deployment.md#새-버전-게시)에 있다.
문서, 테스트 자산과 로컬 산출물의 보관 위치는 [개발환경과 저장소 산출물](docs/repository-workflows.md)을 따른다.
