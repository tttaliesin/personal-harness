# Korean development writing

## Purpose

한국어 개발 문서에서 주체, 행동과 적용 조건을 명확하게 쓴다.
윤문이 필요한 문서는 원래의 기술적 의미와 규칙의 범위를 보존한다.

## Requirements

### Requirement: STE-KO for Korean development documents

에이전트는 한국어 README, 기술 명세, 운영 절차 또는 개발 규약을 작성하거나 본문을 고칠 때 STE-KO의 `문서` 규칙을 적용해야 한다(MUST).
적용할 통제 언어의 범위는 STE-KO의 `문서` 규칙으로 한정해야 한다(MUST).
에이전트는 저장소의 문서 규약과 repo-governance를 우선해야 한다(MUST).

#### Scenario: Author a Korean procedure

- **GIVEN** STE-KO와 STE80을 모두 사용할 수 있다.
- **WHEN** 사용자가 한국어 운영 절차 작성을 요청한다.
- **THEN** 에이전트는 STE-KO의 `문서` 규칙을 선택해 행위자와 행동 조건을 명시한다.

#### Scenario: Handle unrelated work

- **WHEN** 일반 대화, 코드 편집, UI 문구나 다른 언어의 문서를 다루고 한국어 개발 문서는 요청 범위에 없다.
- **THEN** 에이전트는 해당 작업에 맞는 규칙을 사용한다.

### Requirement: Optional meaning-preserving polishing

에이전트는 번역투나 기계적인 반복을 다듬어야 하는 한국어 개발 문서에 원본 `humanize-korean`을 자율적으로 선택해야 한다(MUST).
윤문본을 적용하기 전에 주체, 행동, 조건, 예외와 의무·허용·금지의 범위를 수정 전 원고와 대조해야 한다(MUST).
윤문본에 수치, 단위, 명령과 식별자를 그대로 유지해야 한다(MUST).
의미가 달라졌거나 동등성을 확인할 수 없는 구간에는 윤문 전 표현을 사용해야 한다(MUST).
작업본은 BOM 없는 UTF-8로 준비해야 한다(MUST).
실행 산출물은 Git 제외를 확인한 로컬 경로나 작업 트리 밖의 작업 폴더에 둬야 한다(MUST).

#### Scenario: Polish a draft that needs editing

- **WHEN** 한국어 개발 문서 초안에 번역투나 기계적인 반복이 남아 있다.
- **THEN** 에이전트는 `humanize-korean`을 선택한다.
- **AND** 윤문한 구절의 의미와 규칙의 범위를 원고와 대조한다.

#### Scenario: Preserve a clause with an uncertain rewrite

- **WHEN** 윤문본이 원고의 의무를 약하게 만들거나 원고와 의미가 같은지 확인하기 어렵다.
- **THEN** 에이전트는 해당 구절에 원고의 표현을 사용한다.

#### Scenario: Keep an already clear document

- **WHEN** 문서가 이미 자연스럽거나 요청 범위가 맞춤법 수정에 한정된다.
- **THEN** 에이전트는 요청된 작성 또는 수정 범위에서 작업을 마친다.

### Requirement: Shared Windows editor run directory

Windows에서 원본 윤문 스크립트를 실행할 때 에이전트는 `humanize-windows-runtime`을 함께 선택해야 한다(MUST).
준비 단계는 호출 사이에 유지되는 쓰기 가능한 절대 경로 아래에 실행 폴더를 만들어야 한다(MUST).
준비 단계에서 얻은 실행 폴더(`runDir`)와 Python 실행 파일(`python`)의 절대 경로는 윤문, 진단 및 검증에서 재사용해야 한다(MUST).
협업 에이전트가 참여하면 같은 두 경로를 전달해야 한다(MUST).

#### Scenario: Preparing and verifying in separate Desktop calls

- **GIVEN** 준비 단계가 호출 사이에 유지되는 작업 위치에 실행 폴더를 만들고 `runDir`와 `python`의 절대 경로를 반환했다.
- **WHEN** 윤문 또는 검증을 맡은 후속 도구 호출이나 협업 에이전트의 프로세스 임시 경로가 준비 단계와 다르다.
- **THEN** 후속 호출은 같은 `runDir`의 원고와 윤문본을 사용한다.
- **AND** 원본 스크립트를 실행할 때는 준비에서 얻은 `python`을 사용한다.
