# 한글 조판 적용 패턴

아래 CSS는 기존 제품 토큰이 없을 때 고르는 예시다.
그대로 붙여 넣는 필수 프리셋이 아니며 실제 폰트 파일과 제품의 밀도에 맞게 바꾼다.

## 크기·행간·자간

새 일반 UI의 본문은 16–18px, 단위 없는 `line-height` 1.5–1.8에서 시작할 수 있다.
촘촘한 표와 작은 보조 정보는 화면 밀도에 맞게 조정한다.
긴 읽기용 본문은 읽는 흐름에 맞게 조정한다.
기존 제품의 접근성 설정과 글자 확대를 유지한다.

여러 줄 한글 제목은 행간 1.2–1.4에서 시작해 획의 밀도와 제목 크기에 맞게 조정할 수 있다.
한글 제목의 행간과 자간은 실제로 사용하는 한글 글자에 맞춰 정한다.
자간은 `normal` 또는 `0`에서 시작하고 실제 서체와 크기를 본 뒤 소폭 조정한다.
같은 수치에서도 한글과 영문은 보이는 밀도가 다를 수 있다.
제목·본문·버튼·설명·데이터는 실제 제공하는 굵기와 글자 크기로 역할을 구별한다.

## 어절을 우선하는 짧은 문구

제목·버튼·짧은 소개 문구는 `keep-all`을 먼저 고려한다.
긴 상품명·URL·영문 식별자가 넘치지 않도록 `overflow-wrap`과 컨테이너의 최소 너비를 함께 검토한다.

```css
.ko-copy {
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.text-column {
  min-inline-size: 0;
}
```

keep-all은 어절 안의 줄바꿈을 억제한다.
anywhere는 달리 줄을 나눌 곳이 없는 긴 문자열에 비상 줄바꿈을 허용한다.
한글을 어절로 유지하는 것이 좁은 표나 모든 본문에서 항상 최선인 것은 아니다.
그런 곳은 normal을 선택하고 실제 줄바꿈과 행 높이를 확인한다.

모바일에서 한두 글자만 남는 제목, 조사만 떨어지는 줄, 과도한 빈 줄과 잘린 받침을 확인한다.
고정 `<br>`를 넣기 전에 제목 너비·글자 크기·문구를 조정한다.
편집 의도가 있는 줄바꿈은 화면 크기별 결과를 확인해 사용할 수 있다.
한글 문구의 분량과 배치는 실제 한국어 제목·버튼·본문으로 판단한다.
영문용 단어 수·대문자·`ch` 기준은 해당 언어의 배치에만 적용한다.

## 한글과 영문 역할 분리

`lang="ko"`를 한국어 문서나 해당 구간에 지정한다.
다국어 화면은 언어별 폰트 토큰을 둘 수 있다.
정렬이 필요한 수치 열에는 `tabular-nums`를 고려한다.

```css
:root {
  /* 실제로 연결한 패밀리를 맨 앞에 둔다. */
  --font-ui-ko: "Pretendard Variable", "Apple SD Gothic Neo",
    "Malgun Gothic", system-ui, sans-serif;
}

.product-ui:lang(ko) {
  font-family: var(--font-ui-ko);
}

.product-ui button,
.product-ui input,
.product-ui textarea,
.product-ui select {
  font: inherit;
}

.numeric-column {
  font-variant-numeric: tabular-nums;
}
```

CSS에 이름을 적는 것만으로 웹폰트가 내려받아지지는 않는다.
선택한 패밀리는 프로젝트가 이미 사용하는 font loader나 실제 font-face 정의로 연결한다.
브랜드의 영문 제목 서체를 유지할 때는 역할·언어별 토큰을 분리하고 한글과의 균형을 확인한다.
사용자가 기대하는 기존 폼·버튼 스타일은 보존한다.

## 검증과 출처

- [W3C 한국어 조판 요구사항](https://www.w3.org/TR/klreq/#line-breaking): 글자·어절 줄바꿈 선택을 설명하는 작업 중 문서다.
- [CSS Text 3의 word-break](https://www.w3.org/TR/css-text-3/#word-break-property)와 [overflow-wrap](https://www.w3.org/TR/css-text-3/#overflow-wrap-property): 속성의 동작을 정의한다.
- [WCAG 2.2 Text Spacing 설명](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html): 사용자의 간격 조정 후에도 내용과 기능을 유지하는 요구다.
  저자가 모든 본문의 행간·자간을 그 수치로 지정해야 한다는 뜻은 아니다.

실제로 쓰인 글꼴이 줄바꿈에 영향을 주는지 불확실하면 [글리프 검증](glyph-review.md)을 참고한다.

이 스킬의 px·행간 범위는 제작 판단을 돕는 출발점이다.
출처의 표준 수치나 모든 화면에 대한 가독성 보장으로 인용하지 않는다.
