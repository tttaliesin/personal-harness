# 자체 플러그인 배포

## Codex Git 마켓플레이스

Codex는 공개 `main`의 [마켓플레이스 카탈로그](../.agents/plugins/marketplace.json)에서 `personal-harness`를 읽는다.
설치 명령은 [자체 플러그인 설치](../README.md#자체-플러그인-설치)에 있다.

Windows Agent Devkit과 Worker Orchestrator는 Node.js 24 이상에서 실행한다.
PC의 기본 Node.js가 이전 버전이면 호환되는 기존 실행 파일을 사용한다. [Devkit 요구 사항](../packages/windows-agent-devkit/package.json) · [Worker Orchestrator 요구 사항](../packages/worker-orchestrator/package.json)

### 기존 로컬 설치 전환

기존 로컬 마켓플레이스에서 설치한 플러그인을 공개 마켓플레이스의 배포본으로 바꿀 때 다음 순서를 따른다.

1. `personal-harness` 출처에서 사용할 플러그인을 설치한다.
2. 플러그인 목록에서 새 출처의 항목이 활성 상태인지 확인한다.
3. 같은 플러그인의 이전 로컬 출처 항목을 끈다.
   이전 출처는 `repo-governance-local`, `windows-agent-devkit-local`, `worker-orchestrator-local`이다.
4. Codex를 다시 연다.
5. 새 채팅에서 플러그인과 스킬을 확인한다.

플러그인 설정과 훅 신뢰는 해당 환경의 Codex 프로필에서 관리한다.
`repo-governance`의 제품별 설정은 대상 작업트리에서 `task bind:product`로 연결한다. [제품 설정 연결 절차](../packages/repo-governance/plugin/skills/repo-governance/references/repository-policy.md)
Worker Orchestrator의 작업 기록과 프로젝트 위임은 각 환경에서 관리한다.

### PC에서 갱신

새 배포본이 공개 `main`에 올라오면 마켓플레이스를 갱신한다.

```bash
codex plugin marketplace upgrade personal-harness
```

Codex를 다시 열고 플러그인 목록에서 설치한 버전을 확인한다. [Codex 마켓플레이스 명령](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)

## 자체 플러그인 소스와 배포본

플러그인의 소스와 테스트는 각 `packages/<name>/`에 둔다.
카탈로그의 `source.path`는 저장소 루트를 기준으로 해석한다.

| 플러그인 소스 | 이관한 소스 버전 | 이관 기준 커밋 | 카탈로그의 배포 경로 | 첫 공개 버전 |
|---|---|---|---|---|---|
| [repo-governance](../packages/repo-governance/) | `0.2.0` | `441a74e4334d1240319ce635e10cc3c6062a4825` | `./packages/repo-governance/plugin` | `0.2.0` |
| [Windows Agent Devkit](../packages/windows-agent-devkit/) | `0.3.5` | `2ccf5538f6ebfd6c0179c9467ae53c10a18f76d4` | `./packages/windows-agent-devkit/release` | `0.3.5` |
| [Worker Orchestrator](../packages/worker-orchestrator/) | `0.1.7-local.1` | `7b2d76691bd677f72aaa63f5f674d8eb7ac2d79b` | `./packages/worker-orchestrator/release` | `0.1.6` |

`repo-governance`는 공개 `main`의 공용 `plugin/`을 배포한다.
개인용 카탈로그와 개인·조직별 설정은 각 환경에서 관리한다.

Windows Agent Devkit `0.3.5`의 첫 공개 배포본은 이전 배포본의 `docs/roadmap.md`에 있던 개인 WSL 작업 경로 한 곳을 가렸다.
실행 파일을 포함한 나머지 파일은 이전 배포본과 바이트가 같다.

Worker Orchestrator `0.1.6`의 파일 목록과 파일별 SHA-256은 승인한 기존 배포본과 일치한다.
이 배포본의 매니페스트에는 커밋 `7ef027ac9be7c9e175c17657b1a0fb1f9a3f0f62`가 기록돼 있다.
`0.1.7-local.1`은 이관한 개발 소스의 버전이다.

### 첫 공개 배포본의 해시

이전 `bundle_sha256`은 로컬 마켓플레이스 카탈로그를 포함한 전체 번들의 등록값이다.
공개 해시는 첫 게시 시점에 카탈로그가 가리킨 플러그인 디렉터리의 값이다.

| 첫 게시 대상 | 이전 로컬 번들 `bundle_sha256` | 공개 배포 디렉터리 SHA-256 |
|---|---|---|
| Windows Agent Devkit `0.3.5` | `5ae22630f461a94b5a15f8fb9ab1c6de92d2e7c84bdb34eaa378b3e4ddc7f092` | `6211565cdc8eafdec3e69e4c947b09953f4680b875278bc8e8c423d21d489b09` |
| Worker Orchestrator `0.1.6` | `d6e809c0fbb692a218275b7f457e30abb7fb0d63c5c327b9a68cfa4dbd6633d4` | `82b8843c95ac705494684618c7fbc29ecbb2705226c5f976ab5890389ed9435e` |

### 배포본 해시 검증

저장소 루트에서 `npm test`를 실행한다.
[배포 테스트](../tests/distribution.test.mjs)는 카탈로그의 이름과 경로, 매니페스트와 필수 파일을 확인한다.
테스트는 두 `release/`의 버전과 디렉터리 SHA-256을 고정값과 대조한다.
`repo-governance`는 해당 플러그인의 번들 매니페스트로 검사한다.

커밋에 들어간 배포본은 Git blob의 원시 바이트로 확인한다.
아래 명령의 `HEAD`에는 검증할 커밋을 지정한다.

```bash
git ls-tree -r HEAD -- packages/windows-agent-devkit/release packages/worker-orchestrator/release
```

1. 각 `release/`에 대해 숨김 파일을 포함한 모든 일반 파일의 blob ID를 확인한다.
2. `git cat-file blob <blob-id>`가 반환한 원시 바이트의 SHA-256을 계산한다.
3. `release/` 아래의 상대 경로를 `/`로 구분하고 경로 순으로 정렬한다.
4. 상대 경로와 파일별 SHA-256을 공백 없는 ASCII 이스케이프 JSON 객체로 직렬화한다.
5. 그 JSON의 UTF-8 바이트를 SHA-256으로 해시해 배포 테스트의 고정값과 대조한다.

두 `release/`에 대한 Git 줄 끝 변환은 [.gitattributes](../.gitattributes)에서 끈다.

### 새 버전 게시

바꿀 플러그인의 소스 디렉터리에서 아래 명령을 표의 순서대로 실행한다.

| 소스 | 테스트와 패키징 명령 |
|---|---|
| Windows Agent Devkit | `npm ci --ignore-scripts`, `npm test`, `npm run build`, `npm run package`, `npm run check -- --packaged` |
| Worker Orchestrator | `npm test`, `npm run build`, `npm run check` |
| repo-governance | `npm test`, `npm run bundle:build`, `npm run verify:bundle`, `task package DEST=../../.local/artifacts/repo-governance-runtime` |

`repo-governance`를 패키징할 때는 출력 경로의 상위 폴더인 `.local/artifacts`를 먼저 준비한다.
`DEST`에는 아직 존재하지 않는 폴더를 지정한다. [플러그인 패키징 명령](../packages/repo-governance/Taskfile.yml)

1. 카탈로그가 가리키는 경로에 새 배포본을 준비한다.
   Devkit은 `npm run package`가 출력한 `directory`의 내용으로 `release/`를 교체한다.
   Worker Orchestrator는 `dist/codex/worker-orchestrator/`의 내용으로 `release/`를 교체한다.
   `repo-governance`는 공용 `plugin/`을 갱신한다.
2. 배포 경로의 플러그인 이름과 버전을 확인한다.
3. Devkit 또는 Worker Orchestrator의 `release/`를 교체했다면 검증한 버전과 SHA-256을 [배포 테스트](../tests/distribution.test.mjs)에 기록한다.
4. 저장소 루트에서 `npm test`를 실행한다.
5. 임시 Codex 프로필에서 마켓플레이스 등록과 새 버전 설치를 확인한다.
6. 게시할 커밋의 blob 해시를 위 절차로 확인한다.
7. 플러그인 소스 변경과 배포본을 함께 공개 `main`에 게시한다.
8. 설치한 환경에서 Codex 마켓플레이스를 갱신한다.
