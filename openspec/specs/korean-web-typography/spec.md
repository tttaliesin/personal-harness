# 한글 웹 타이포그래피

## Purpose

`korean-typography`는 한국어 화면에서 제품에 맞는 서체와 조판을 선택하도록 돕는다.
혼합 문자열의 줄바꿈, 웹폰트 로딩과 한글 글리프에 실제로 적용된 글꼴을 확인한다.

## Requirements

### Requirement: Language-aware selection

한국어 웹·앱 UI를 만들거나 시각적으로 수정·검토할 때 `korean-typography`를 명시적 호출 없이 선택할 수 있어야 한다(MUST).
화면 구성이나 전반적인 시각 디자인도 작업에 포함되면 해당 디자인 스킬을 함께 선택해야 한다(MUST).

#### Scenario: Korean deliverable

- **WHEN** 사용자가 한국어 텍스트가 있는 인터페이스를 요청한다.
- **THEN** 결과물의 언어와 독자를 기준으로 적용 범위를 정하고 필요한 조판 참조를 선택한다.

#### Scenario: English deliverable requested in Korean

- **GIVEN** 대화는 한국어로 진행한다.
- **WHEN** 사용자가 영어 인터페이스를 요청한다.
- **THEN** 결과물의 언어와 서체를 영어 인터페이스의 요구에 맞춘다.

#### Scenario: Typography and visual design overlap

- **WHEN** 한국어 UI의 조판과 함께 화면 구성이나 전반적인 시각 디자인을 작업한다.
- **THEN** 해당 디자인 지침도 함께 선택한다.

### Requirement: Preserve brand and original skills

조판은 기존 브랜드 서체와 디자인 토큰을 우선해야 한다(MUST).
조판 변경은 대상 프로젝트의 토큰과 스타일에 한정해야 한다(MUST).

#### Scenario: Existing brand font covers Hangul

- **WHEN** 한국어 인터페이스에 이미 적합한 브랜드 서체가 있다.
- **THEN** 해당 패밀리를 유지하면서 제목, 본문, 버튼과 데이터 등 역할별 조판을 검토한다.

#### Scenario: English brand font needs Korean coverage

- **WHEN** 영문 브랜드 서체를 사용하는 화면에 한글을 표시한다.
- **THEN** 영문 브랜드 서체를 유지하면서 한글을 지원하는 서체를 연결할 수 있다.
- **AND** 영어용 조판 기본값이 충돌하면 한국어 구간의 실제 문구와 배치에 맞춘다.

### Requirement: Verify Hangul and wrapping

검증은 대상 프로젝트의 기존 확인 범위와 판정 기준에 맞춰야 한다(MUST).
CSS의 글꼴 지정과 로딩 상태를 실제 글리프에 적용된 글꼴과 구별해야 한다(MUST).

#### Scenario: Declared font falls back

- **GIVEN** CSS에 선언한 글꼴에 화면에서 사용하는 한글 글리프가 없다.
- **WHEN** 해당 글리프를 그린 글꼴을 확인한다.
- **THEN** 브라우저의 렌더링 글꼴 정보나 CDP의 노드별 글꼴과 글리프 수로 실제 사용 글꼴을 확인한다.
- **AND** 계산된 `font-family`와 `document.fonts.check()`는 설정과 로딩을 확인하는 데 사용한다.

#### Scenario: Narrow mixed-script content

- **WHEN** 한국어 UI에 긴 상품명, URL 또는 영문 식별자가 있다.
- **THEN** 좁은 화면과 데스크톱에서 실제 혼합 문자열의 줄바꿈과 넘침을 확인한다.
- **AND** 컴포넌트에 따라 어절 또는 글자 단위 줄바꿈과 필요한 비상 줄바꿈을 선택한다.

#### Scenario: Font loading affects the rendered interface

- **WHEN** 작업 범위에 웹폰트 로딩과 표시 검증이 포함된다.
- **THEN** 로딩 전후의 줄바꿈과 대체 글꼴을 확인한다.
- **AND** 작업 범위에서 글자 확대나 사용자 간격 조정 후에도 내용과 기능을 사용할 수 있는지 확인한다.
- **AND** 확인한 화면, 글꼴, 로딩 조건과 남은 한계를 보고한다.
