# Worker Orchestrator

기존 Codex Desktop 도구로 프로젝트별 워커 대화를 관리합니다.
Node.js 24 이상이 필요합니다.
컨트롤러가 사용자의 직접적인 권한 범위에서 도구를 호출합니다.
이 패키지는 새로운 UI·MCP 서버·hook·원격 endpoint를 제공하지 않습니다.

```text
node <설치 루트>/dist/cli.mjs capabilities
node <설치 루트>/scripts/check-package.mjs --state-dir <임시 절대 경로>
node <설치 루트>/dist/cli.mjs <command> --state-dir <절대 경로> --input <JSON 파일 또는 ->
```

`capabilities`는 로컬 지원 정보를 출력합니다.
공식 Desktop 도구의 현재 노출 여부와 권한은 컨트롤러가 별도로 확인합니다.
`skills/`의 controller와 worker 스킬은 기본 자동 발견을 사용합니다.
스킬 선택만으로 대화 변경이 허용되지는 않습니다.

- [사용법](docs/usage.md)은 입력과 실행 순서를 설명합니다.
- [구조](docs/architecture.md)는 실행 책임을 설명합니다.
- [패키지 형식](docs/packaging.md)은 설치 경로와 무결성 검사를 설명합니다.
- [공통 컨트롤러 절차](workflows/controller.md)는 builder에 독립적인 생명주기를 설명합니다.

실제 Desktop 설치본의 생명주기 검증은 별도 실행 증거로 확인합니다.
패키지 검사 통과만으로 실제 호스트 동작의 성공을 주장하지 않습니다.
