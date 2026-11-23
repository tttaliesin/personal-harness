# Personal Harness의 현행 명세

[`specs/`](specs/)는 2026-11-23에 확인한 공개 `main`의 배포 파일과 공개 사용 지침에 적용된다.
기준 커밋은 [`a0eca5178f9b58ad727debaf5686a38076014e9e`](https://github.com/tttaliesin/personal-harness/commit/a0eca5178f9b58ad727debaf5686a38076014e9e)다.
이 기준은 마켓플레이스가 제공하는 버전을 가리킨다.
각 PC의 설치 상태와 실제 모델 세션 결과는 해당 환경의 관찰로 판단한다.

| 영역 | 기준 명세 |
| --- | --- |
| 마켓플레이스와 배포 | [Codex 마켓플레이스](specs/codex-git-marketplace/spec.md) · [단독 스킬과 외부 리소스](specs/skill-and-plugin-distribution/spec.md) · [자체 플러그인 배포](specs/owned-plugin-sources/spec.md) |
| Repo Governance `0.2.0` | [K1–K7 규약](specs/repository-conventions/spec.md) · [도입과 계약 해석](specs/governance-contract-resolution/spec.md) · [기계 검사](specs/governance-machine-checks/spec.md) · [훅](specs/governance-host-hooks/spec.md) · [변경 후보](specs/governance-mutation-verification/spec.md) · [선택형 CI](specs/governance-ci-checks/spec.md) |
| Windows Agent Devkit `0.3.5` | [진단 CLI](specs/windows-diagnostic-cli/spec.md) · [프로젝트 요구](specs/windows-project-tool-requirements/spec.md) · [호스트 조회](specs/windows-host-observation/spec.md) · [작업 실행기](specs/windows-task-runner-advice/spec.md) · [추가 진단](specs/windows-advanced-diagnostics/spec.md) |
| Worker Orchestrator `0.1.6` | [프로젝트 제어](specs/worker-project-control/spec.md) · [실행과 병렬 배정](specs/worker-run-lifecycle/spec.md) · [결과 평가](specs/worker-result-evaluation/spec.md) · [이벤트 전달](specs/worker-event-delivery/spec.md) |
| 자체 스킬 | [README 작성](specs/readme-authoring/spec.md) · [개발환경](specs/development-environment-guidance/spec.md) · [저장소 산출물](specs/repository-artifact-guidance/spec.md) · [한글 타이포그래피](specs/korean-web-typography/spec.md) |
| 도구 및 어댑터 | [CodeGraph와 OpenSpec](specs/development-tool-routing/spec.md) · [Context7과 Microsoft Learn](specs/library-documentation/spec.md) · [NuGet](specs/nuget-package-tools/spec.md) · [FSD](specs/feature-sliced-design-guidance/spec.md) · [한국어 개발 문서](specs/korean-development-writing/spec.md) · [Taste](specs/frontend-design-skill/spec.md) · [Taste Windows 실행](specs/taste-windows-runtime/spec.md) · [Windows Computer Use](specs/windows-app-automation/spec.md) |

## 미배포 변경

아래 항목은 `changes/`에서 진행 상태를 확인한다.

| 변경 | 현재 상태 |
| --- | --- |
| [Repo Governance 스킬 분할](changes/split-repo-governance-skills/proposal.md) | 작업별 스킬과 pi 경로 조정은 로컬에 구현돼 있다. 두 번들의 스킬 선택 조건은 명세화했으며 실제 호스트에서의 적용은 미확인이다. |
| [Repo Governance CI 검사기 경로](changes/fix-governance-ci-checker-path/proposal.md) | 모노레포 배포 경로를 찾는 템플릿과 회귀 테스트가 로컬에 있다. |
| [단독 스킬 지침 보완](changes/refine-standalone-skill-guidance/proposal.md) | README, 개발환경, 한글 타이포그래피, 산출물 관리에 대한 로컬 지침 변경이다. |

## 이력

완료된 변경의 제안·설계·당시 검증 내용은 [`changes/archive/`](changes/archive/)에 있다.
폐기한 프로필 설치기의 패키지·캐시·동기화 규칙은 당시 작업 기록으로 보존한다.
