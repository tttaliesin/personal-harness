# Proposal

## Why

C# 패키지 작업에서 공식 피드와 실제 의존성 정보를 자율적으로 확인할 수 있어야 한다.
기존 프로젝트의 .NET 버전을 바꾸지 않고 두 Windows PC에서 같은 MCP 구성을 재현한다.

## What Changes

- 공식 NuGet.Mcp.Server를 버전 고정된 NuGet MCP 등록으로 관리한다.
- 하네스 전용 .NET 실행 환경과 검증된 패키지를 설치하고 stdio로 연결한다.
- 패키지 작업의 자율 선택 범위를 공통 지침과 등록 문서에 반영한다.
- 두 PC의 실제 호출과 설정 보존을 확인한다.

## Capabilities

### New Capabilities

- `nuget-package-tools`: 프로젝트의 .NET 설정을 유지하는 공식 NuGet MCP 설치와 자율 선택.

### Modified Capabilities

없음.

## Impact

registry, 의존성 lock, MCP 패키지 설치기, 공통 사용자 지침과 배포 문서가 변경된다.
repo-governance, 인증, 세션, 기존 프로젝트 파일과 전역 .NET 등록은 보존한다.
