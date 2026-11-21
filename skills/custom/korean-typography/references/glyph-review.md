# 실제 글꼴과 글리프 확인

작업에 맞는 기존 브라우저 검증에서 실제 한국어 문구와 영문·숫자·기호를 섞은 문자열을 확인한다.
혼합 문자열은 다음처럼 구성할 수 있다.

> 한글 화면을 또렷하게 읽습니다. 제품 Pro 2.0 · 10,000원 · ₩123,456 · 가나다라마바사

좁은 화면과 데스크톱에서 작업 범위에 해당하는 제목·본문·버튼·입력창·수치 열을 확인한다.
폰트 로딩 전후의 줄바꿈과 대체 글꼴을 비교한다.
필요하면 폰트 로딩을 막고도 읽을 수 있는지 확인한다.
글자 확대나 사용자 텍스트 간격 조정 후에도 내용과 기능을 유지한다.

계산된 `font-family`와 `document.fonts.check()` 결과는 폰트 설정과 로딩을 조사할 때 참고한다.
한글 글리프를 그린 글꼴을 판별해야 하면 브라우저의 렌더링 글꼴 정보나 CDP의 노드별 글꼴과 글리프 수를 확인한다.
합성 굵기와 기울기는 실제 서체 파일의 굵기 및 스타일과 구별한다.

확인한 화면·서체·로딩 조건과 남은 한계를 보고한다.

## 출처

- [CSS Font Loading의 check](https://drafts.csswg.org/css-font-loading/#font-face-set-check)
- [CDP getPlatformFontsForNode](https://chromedevtools.github.io/devtools-protocol/tot/CSS/#method-getPlatformFontsForNode)
