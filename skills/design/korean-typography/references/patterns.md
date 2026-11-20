# 한글 조판 적용 패턴

아래 CSS는 기존 제품 토큰이 없을 때 고르는 예시다.
그대로 붙여 넣는 필수 프리셋이 아니며 실제 폰트 파일과 제품의 밀도에 맞게 바꾼다.

## 어절을 우선하는 짧은 문구

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

## 한글과 영문 역할 분리

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
- [CSS Font Loading의 check](https://drafts.csswg.org/css-font-loading/#font-face-set-check): 폰트 집합 상태 확인과 실제 글리프 선택은 구분한다.
- [CDP getPlatformFontsForNode](https://chromedevtools.github.io/devtools-protocol/tot/CSS/#method-getPlatformFontsForNode): 노드에서 실제 사용된 글꼴과 glyph 수를 확인할 수 있다.

이 스킬의 px·행간 범위는 제작 판단을 돕는 출발점이다.
출처의 표준 수치나 모든 화면에 대한 가독성 보장으로 인용하지 않는다.
