# 프로젝트의 목적과 범위

Windows Agent Devkit은 Windows 개발 도구를 권장하고 프로젝트 환경을 읽기 전용으로 점검합니다.
사용자가 직접 실행할 확인 명령도 안내합니다.

## 대상 언어와 실행 문맥

대상 계열은 Node.js·Python·Go·Rust·Zig·C#입니다.
Node.js 계열은 JavaScript와 TypeScript 프로젝트를 포함합니다.
C# 개발환경은 .NET SDK를 기준으로 다룹니다.
프로젝트 선언과 사용자 선택에서 필요한 계열만 활성화합니다.
이 목록은 모든 플랫폼 조합의 검증 완료 목록이 아닙니다.

실행 문맥은 Windows 네이티브·WSL 2·Docker 기반 Linux 컨테이너로 구분합니다.
WSL과 Docker는 프로젝트가 요구할 때 선택합니다.
컨테이너의 보조 서비스와 앱의 실행 위치를 같은 근거로 취급하지 않습니다.
개발 서비스의 관리 대상으로 Lazydocker와 Process Compose를 포함합니다.
도구 선택의 구체적인 이유는 [Windows 개발환경](windows-environment.md)에 기록합니다.

## 사용자와 보존 원칙

Windows에서 AI 에이전트와 개발 도구를 함께 사용하는 사람을 대상으로 합니다.
새 환경의 준비와 기존 환경의 문제 확인을 모두 다룹니다.
개별 사용자의 현재 구성을 모든 사용자의 기본값으로 가정하지 않습니다.
프로젝트의 런타임·패키지 관리자·잠금 파일·빌드 명령·CI·배포 경로를 유지합니다.
공통 권장 구성과의 차이는 프로젝트 요구 위반과 별도로 설명합니다.
기존 구성의 유지 사유가 저장돼 있으면 해당 프로젝트와 역할의 권장안에 반영합니다.

## 산출물

| 산출물 | 범위 |
| --- | --- |
| 환경 제안 문서 | 도구의 역할과 선택 조건 |
| 진단 CLI | `doctor`의 읽기 전용 조회, 30개 점검 ID, 사용자용 확인 명령 |
| 로컬 플러그인 패키지 | `environment-doctor` Skill, CLI 번들, 지원 파일, 문서와 고지 |

진단 CLI의 실행 기준은 Windows 11 x64, Node.js 24 이상과 PowerShell 7입니다.
대상 프로젝트에 진단용 의존성을 추가하지 않습니다. [CLI 구현 구조](implementation-plan.md)

## 도구 권장과 진단 범위

`doctor`는 현재 환경과 프로젝트 요구를 대조합니다.
신규 다중언어 프로젝트에는 mise tasks를 기본 권장합니다.
기존 mise tasks·Taskfile·Justfile·Makefile·npm scripts는 선언과 CI 호출을 정적으로 대조합니다.
선언을 해석할 근거가 부족한 경우에는 판단을 보류합니다. [작업 실행기 선택](task-runners.md)

`doctor`는 프로젝트 파일, 기존 유지 사유, 호스트 도구의 정보를 읽기 전용으로 조회합니다.
프로젝트 명령이나 서비스 상태는 사용자가 확인할 명령으로 안내합니다. [진단 CLI 사용법](diagnostic-cli.md)

```mermaid
mindmap
  root((Windows Agent Devkit))
    도구 권장
      개발 도구
      작업 실행기
    읽기 전용 진단
      프로젝트 선언
      호스트 조회
      30개 점검 ID
    수동 확인 안내
      도구 이름
      인수
      설명
```

## 문서와 후속 작업

명령 사용법은 [진단 CLI 사용법](diagnostic-cli.md)을 따릅니다.
실행기 선택과 공식 자료의 확인일·적용 범위는 [작업 실행기 가이드](task-runners.md)를 따릅니다.
플러그인의 기능 경계는 [플러그인 범위](plugin-scope.md)에 기록합니다.
모듈의 입력·출력은 [완료 계약](completion-contract.md)에 기록합니다.
