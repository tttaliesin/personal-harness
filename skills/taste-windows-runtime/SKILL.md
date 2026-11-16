---
name: taste-windows-runtime
description: Run Taste Skill browser checks on Windows through the installed Chrome or Edge without editing the original plugin. Select alongside Taste when running gate, consistency, layout, screenshots or performance scripts on Windows.
---

# Taste Windows 실행 호환

Windows에서 Taste의 브라우저 검사 명령을 실행할 때 이 스킬의 `scripts/run.mjs`를 앞에 둔다.
기존 프로젝트 폴더에서 원본 스크립트와 인수를 그대로 전달한다.

```powershell
node <this-skill>/scripts/run.mjs <taste-skill>/scripts/gate.mjs index.html
node <this-skill>/scripts/run.mjs <taste-skill>/assets/layout/check.mjs --url index.html --profile .taste-skill/chrome-layout
```

`consistency.mjs`, `shoot.mjs`, `perf.mjs`에도 같은 접두부를 사용할 수 있다.
`<this-skill>`과 `<taste-skill>`은 현재 스킬 목록에서 확인한 실제 경로다.

이 실행기는 자식 프로세스에만 `CHROME_PATH`를 설정한다.
기존 `CHROME_PATH`가 있으면 그 선택을 존중하고, 없으면 설치된 Chrome·Edge를 찾는다.
Edge의 headless 실행에는 호환 계층 재실행을 막는 플래그를 전달한다.
기존 `NODE_OPTIONS`를 보존하며 원본 검사와 종료 코드는 그대로 유지한다.
중단 신호는 원본 정리 핸들러에 전달한다.
원본이 10초 동안 응답하지 않을 때만 이 실행기가 시작한 프로세스 계열을 종료한다.

원본 플러그인 캐시, 프로젝트의 kit 파일, 사용자 프로필과 repo-governance는 편집하지 않는다.
검사 프로필과 제한 시간, 판정·waiver·시각 검토는 기존 Taste 흐름을 따른다.
브라우저 실행 성공과 페이지의 `GATE: PASS`는 별도 결과다.
실제 FAIL을 지우거나 검사를 생략해 통과시키지 않는다.
이 호환 스킬은 새 승인이나 필수 검증 단계를 추가하지 않는다.
