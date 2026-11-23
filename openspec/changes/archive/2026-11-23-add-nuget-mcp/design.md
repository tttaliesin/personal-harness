# Design

## Context

기존 등록기는 npm·Python 패키지와 HTTP MCP를 지원한다.
두 PC에 SDK가 없어 공식 .NET 10 SDK를 하네스 전용 경로에서 사용한다.
동기는 proposal.md에 정의한다.

## Goals / Non-Goals

**Goals:** 공식 패키지·런타임 출처와 해시를 고정하고 실제 stdio 실행을 재현한다.

**Non-Goals:** 기존 프로젝트의 TFM·SDK·global.json 변경, 전역 PATH 변경, hook 추가.

## Decisions

NuGet MCP의 NuGet 등록 종류를 추가한다.
공식 NuGet.org 기본 패키지와 Windows x64 payload의 원본 및 실행 선언을 확인한다.
공식 .NET 10 SDK ZIP은 Microsoft 배포 메타데이터의 SHA512로 검증한다.
실제 PC 절대경로는 생성되는 설정과 무시되는 상태에만 둔다.

MCP는 격리된 SDK host에서 공식 DLL을 직접 실행한다.
프로세스별 실행 환경과 작업 디렉터리를 지정해 프로젝트의 SDK 선택과 분리한다.
변경 가능한 실행 상태는 설치 무결성 영수증의 대상 디렉터리 밖에 둔다.
기존 패키지 피드와 인증은 작업 대상의 설정을 따른다.

기존 다른 도구의 lock과 repo-governance는 유지한다.
임시 프로필 테스트와 실제 두 PC 적용 결과는 별도로 기록한다.

## Risks / Trade-offs

- SDK를 전용 설치하므로 추가 디스크 공간이 필요하다.
- 패키지 그래프 작업은 대상 프로젝트 SDK가 별도로 필요할 수 있다.
  이 경우 기존 버전을 유지하고 필요한 조건을 보고한다.
- 새 대화에서의 자율 선택과 MCP 호출은 실제 기록으로 확인한다.
