# Spec Delta

## Purpose

저장소의 스킬 원본을 설치 대상과 연결한다.
원본을 용도나 출처로 정리해도 사용자 프로필은 같은 경로에서 스킬을 찾을 수 있게 한다.

## ADDED Requirements

### Requirement: Deploy registered standalone skills

개인 하네스 설치기는 배포 목록에서 지정한 단독 스킬의 디렉터리 전체를 사용자 스킬로 배포해야 한다(MUST).

#### Scenario: Register a skill in a grouped source directory

- **WHEN** 배포 목록에 유효한 스킬 디렉터리를 등록한다.
- **THEN** 계획은 그 디렉터리의 파일을 `~/.agents/skills/<이름>/`에 복사할 대상으로 표시한다.
- **AND** 적용하면 파일을 계획한 위치에 복사한다.
- **AND** 스킬 내부의 상대 경로를 보존한다.

#### Scenario: A declared tool requirement is absent

- **WHEN** 배포 목록의 스킬이 도구 의존성을 선언했고 잠금 파일에 해당 도구가 없다.
- **THEN** 설치 계획은 해당 스킬의 파일을 배포 대상으로 선택하지 않는다.
