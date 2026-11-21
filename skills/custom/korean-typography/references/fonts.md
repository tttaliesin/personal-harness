# 한글 서체 후보와 로딩 기준

기존 `@font-face`, 폰트 파일, 토큰과 실제 사용 서체를 먼저 확인한다.
브랜드 서체가 한글을 지원하면 유지하고 역할별 크기·굵기·행간을 조정한다.
영문 전용 브랜드 서체는 유지하면서 어울리는 한글 서체를 연결할 수 있다.
본문은 한글·영문·숫자를 함께 다루는 패밀리를 우선 고려한다.
다른 영문 서체를 섞을 때는 실제 글자 크기·굵기·기준선·숫자 폭을 확인한다.

## 서체 후보

아래 역할은 디자인 판단을 돕는 후보이며 가독성·속도·미적 우위의 순위가 아니다.
고딕과 명조는 제품의 인상과 화면의 역할에 맞게 선택한다.
서체가 필요할 때만 프로젝트에 연결하고 후보를 전부 내려받지 않는다.

| 후보 | CSS font-family | 고려할 역할 | 배포 확인 사항 |
|---|---|---|---|
| [Pretendard](https://github.com/orioncactus/pretendard) | `Pretendard` / `Pretendard Variable` | 제품 UI·대시보드·일반 본문 | 정적·가변, 전체·동적 서브셋을 제공한다. CSS의 패밀리와 실제 파일을 맞춘다. |
| [SUIT](https://github.com/sun-typeface/SUIT) | `SUIT` / `SUIT Variable` | UI 본문·폼·탐색 메뉴 | 공식 가변 CSS는 100–900 범위를 선언한다. 동적 서브셋이라고 가정하지 않는다. |
| [Noto Sans KR](https://github.com/google/fonts/tree/main/ofl/notosanskr) | `Noto Sans KR` | 정보 중심 화면·문서·다국어 제품 | 한국어 KR 패밀리를 선택한다. 현재 가변 범위는 100–900이다. |
| [Noto Serif KR](https://github.com/google/fonts/tree/main/ofl/notoserifkr) | `Noto Serif KR` | 기사·에세이·편집형 제목과 본문 | 현재 가변 범위는 200–900이다. 작은 UI의 긴 라벨은 실제 밀도를 확인한다. |
| [마루 부리](https://hangeul.naver.com/font) | `MaruBuri` 및 굵기별 패밀리 | 장문·문화·출판 콘텐츠 | 공식 CSS의 별도 패밀리 방식에 주의한다. |

## 패밀리와 문자 범위

Pretendard Std는 라틴 환경용이므로 한글용 패밀리로 선택하지 않는다.
한글에는 Pretendard 또는 Pretendard Variable 배포물을 확인한다.
[공식 패밀리 구분](https://github.com/orioncactus/pretendard/blob/main/packages/pretendard/README.md#패밀리)

마루 부리의 [공식 CSS](https://hangeul.pstatic.net/hangeul_static/css/maru-buri.css)는 `MaruBuri`, `MaruBuriExtraLight`, `MaruBuriLight`, `MaruBuriSemiBold`, `MaruBuriBold`를 별도 패밀리로 등록한다.
이 CSS에는 굵기별 font-weight 매핑이 없다.
Regular 패밀리에 700만 지정해 실제 Bold 파일을 불러온 것으로 간주하지 않는다.
배포 CSS의 별도 패밀리를 사용하거나 프로젝트에서 정확한 weight 매핑을 구성한다.

Noto의 KR·JP·SC 패밀리는 이름만 다른 하나의 대체재로 취급하지 않는다.
대상 언어와 실제 한자·기호 모양을 확인한다.
사용자 입력·이름·드문 음절이 있으면 자주 쓰는 글자만 들어 있는 축소 파일의 범위를 확인한다.
배포 파일의 한글 문자 범위와 실제 제공하는 굵기를 확인한다.

## 웹폰트 전달

폰트 설정은 필요한 프로젝트의 범위에 한정한다.
신뢰할 수 있는 원본의 WOFF2나 공식 서브셋을 필요한 범위에 맞춰 사용한다.
외부 로딩을 허용하는 프로젝트에서 CDN을 쓰면 버전을 고정한다.
초기 화면에 필요한 파일을 기준으로 `preload` 범위를 정한다.
폴백과 `font-display`는 읽기 가능성과 로딩 뒤 레이아웃 변화를 함께 보고 선택한다.

외부 로딩을 허용하는 프로젝트에서 Pretendard 가변 동적 서브셋을 선택했다면 다음은 버전이 고정된 공식 안내 예시다.

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
      crossorigin>
```

이는 기본 강제 CDN이 아니다.
기존 font loader나 자체 호스팅, CSP와 오프라인 요구를 유지한다.
자체 호스팅은 필요한 CSS의 unicode-range 선언과 그 CSS가 참조하는 파일 경로를 함께 보존한다.
동적 서브셋 CSS를 붙이고 전체 파일만 옮기는 식으로 배포를 섞지 않는다.

가변 폰트가 항상 더 작거나 빠르다고 가정하지 않는다.
필요한 굵기가 몇 개라면 해당 정적 파일과 비교하고, 연속 굵기가 필요하면 가변 범위를 고려한다.
`text=`처럼 문자를 제한하는 요청은 문구가 확정된 제목 등에만 사용하고 동적 본문의 전체 한글 지원으로 간주하지 않는다.
[Google Fonts CSS2 안내](https://developers.google.com/fonts/docs/css2)

## 라이선스와 확인 기준

확인한 후보들은 SIL Open Font License 1.1로 배포된다.
실제 사용할 버전과 파일의 라이선스를 확인하고 폰트 파일을 재배포할 때 요구되는 저작권·라이선스를 함께 보존한다.
브랜드 소유 서체의 라이선스는 별도로 확인한다.

- [Pretendard 라이선스](https://github.com/orioncactus/pretendard/blob/main/LICENSE)
- [SUIT 라이선스](https://github.com/sun-typeface/SUIT/blob/main/LICENSE)
- [Noto Sans KR](https://github.com/google/fonts/blob/main/ofl/notosanskr/OFL.txt), [Noto Serif KR](https://github.com/google/fonts/blob/main/ofl/notoserifkr/OFL.txt)
- [네이버 글꼴 라이선스 안내](https://help.naver.com/service/30016/contents/18088?lang=ko&osType=PC)

패밀리·범위·배포 방식의 조사 기준일은 2026년 11월 16일이다.
프로젝트에 도입할 때 선택한 버전의 실제 CSS와 파일을 확인한다.
