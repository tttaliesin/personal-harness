---
version: alpha
name: governance-tool README
description: GitHub에서 읽는 governance-tool README와 배너의 시각 기준
colors:
  primary: "#a9dc76"
  banner-surface: "#101923"
  banner-text: "#f4f7fb"
  banner-caption: "#afbdcd"
typography:
  banner-title:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: 58px
    fontWeight: 700
    letterSpacing: -1.8px
  banner-caption:
    fontFamily: "Segoe UI, Malgun Gothic, Apple SD Gothic Neo, sans-serif"
    fontSize: 18px
rounded:
  banner: 18px
components:
  readme-banner:
    backgroundColor: "{colors.banner-surface}"
    textColor: "{colors.banner-text}"
    typography: "{typography.banner-title}"
    rounded: "{rounded.banner}"
  readme-banner-caption:
    backgroundColor: "{colors.banner-surface}"
    textColor: "{colors.banner-caption}"
    typography: "{typography.banner-caption}"
omitted:
  - section: spacing
    reason: README 본문의 간격은 GitHub Markdown 렌더러에서 결정한다.
---

# governance-tool README 디자인

## Overview

처음 온 팀원이 도구의 용도를 읽고, 자신의 작업 환경에서 바로 시작할 수 있는 README를 만든다.
첫 부분은 프로젝트 이름, 용도 한 문장, 시작 링크, 대표 사용 예 순으로 읽힌다.
짧은 문장과 실제 입력·결과로 도구를 소개한다.

## Colors

본문, 링크, 표, 코드 블록은 GitHub의 현재 테마 색상을 사용한다.
색상 토큰은 직접 제작하는 배너 안에 적용한다.
`banner-surface`는 배경, `banner-text`는 제목, `banner-caption`은 보조 설명에 사용한다.
`primary`는 배너의 짧은 강조에 사용한다. [배너 원본](../plugin/skills/repo-governance/assets/readme-hero.svg)

## Typography

본문 제목과 코드의 서체 및 크기는 GitHub Markdown 스타일을 사용한다.
프로젝트명은 텍스트 제목으로 한 번 보여준다.
명령과 식별자는 인라인 코드로, 실행 입력은 언어가 지정된 코드 블록으로 표시한다.
`banner-title`과 `banner-caption`은 배너 원본 좌표계에서 제목과 보조 설명에 적용한다.

## Layout

첫 화면의 소개와 시작 링크는 한 덩어리로 배치한다.
주 시작 링크를 굵게 표시한다.
보조 링크는 일반 링크로 표시한다.
좁은 화면에서도 행이 줄바꿈되면 같은 순서로 읽히게 한다.

README에는 기본 경로의 조건과 첫 행동을 둔다.
결과 확인이 필요한 작업에는 예상 결과도 적는다.
운영 설정, 업그레이드, 복구는 독자가 하려는 일의 이름으로 해당 안내에 연결한다.
README에서 직접 사용하는 자료 목록이나 설명서는 본문에 두고 목차를 붙일 수 있다. [nvm README](https://github.com/nvm-sh/nvm/blob/master/README.md#table-of-contents)

### 배치 참고 사례

| 참고 사례 | 가져올 요소 |
| --- | --- |
| LobeHub | 이름, 짧은 소개, 이동 링크를 중앙에 묶는다. [README](https://github.com/lobehub/lobehub/blob/canary/README.md) |
| Dify | 첫 부분에 클라우드와 자체 호스팅처럼 서로 다른 시작 경로를 바로 보여준다. [README](https://github.com/langgenius/dify/blob/main/README.md) |
| Ollama | 본문에 실행 예 하나를 먼저 보여주고 전체 참조 문서는 예시 가까이에서 연결한다. [README](https://github.com/ollama/ollama/blob/main/README.md#get-started) |
| Superpowers | 설치를 하네스별 소제목으로 나누고 독자가 자기 환경으로 바로 이동할 수 있게 한다. [README](https://github.com/obra/superpowers/blob/main/README.md#installation) |
| Hello Algo | 읽기와 내려받기 링크를 자료 예시 위에 둔다. [README](https://github.com/krahets/hello-algo/blob/main/README.md) |

사례는 Trendshift의 전 기간 GitHub Trending 상위권에서 확인했다. [Trendshift 순위](https://trendshift.io/github-trending-repositories)

## Elevation & Depth

제목의 크기, 시작 링크의 굵기, 예시 앞의 여백으로 읽는 순서를 드러낸다.
예시 입력과 인용문은 GitHub의 기본 코드 블록과 인용문 표현을 사용한다.

## Shapes

본문은 텍스트 링크와 Markdown 블록을 사용한다.
직접 제작한 배너의 바깥 모서리에 `rounded.banner`를 사용한다.

## Components

### 제목과 시작 링크

프로젝트명과 한 문장 소개를 한곳에 묶는다.
현재 지원하는 시작 경로를 가장 먼저 연결한다.
보조 링크는 규약이나 지원 환경처럼 시작 경로를 선택하는 데 도움이 되는 곳에 연결한다.

### 첫 화면 예시

<h3 align="center">governance-tool</h3>
<p align="center"><strong>코딩 에이전트에 저장소 이름, README, 커밋을 작성할 때 쓸 팀 규칙과 예시를 제공합니다.</strong></p>
<p align="center">
  <a href="../plugin/README.md#시작하기"><strong>Codex Desktop에서 시작</strong></a>
  · <a href="../plugin/README.md#규약">일곱 규약 보기</a>
  · <a href="../plugin/README.md#검증과-지원-상태">지원 환경 확인</a>
</p>

**에이전트에 요청하기**

```text
$repo-governance
새 팀원이 저장소를 연결하고 Codex Desktop에서 시작하도록 README를 정리해 줘.
기존 설치를 갱신하는 방법은 해당 안내로 연결해 줘.
```

**README에 제안할 문안**

> Node.js 22.18 이상, npm, Git, Task 3이 필요합니다.
> [Codex Desktop에 플러그인](../plugin/README.md#codex-desktop에-설치)을 설치하세요.
> 설치 폴더에서 `task adopt TARGET="제품폴더"`로 [저장소를 연결](../plugin/README.md#저장소에-규약-적용)하세요.
> 이미 사용 중이면 [기존 설치 갱신](../plugin/README.md#설치-갱신)을 따르세요.

### 배너

도구의 용도나 결과를 보여주는 데 도움이 될 때 배너를 사용한다.
배너 제목은 `readme-banner`, 보조 설명은 `readme-banner-caption` 토큰을 사용한다.
이미지에 대체 텍스트를 제공한다.
저장소 이름 예시를 넣을 때는 현재 규약의 사례를 사용한다. [이름 규칙](../plugin/specs/naming.md)

## Do's and Don'ts

- 실행 도구는 실제 입력과 기대 결과를 한 쌍으로 보여준다.
- 설치 방법이 하네스에 따라 달라지면 하네스 이름으로 각 경로를 표시한다.
- 읽거나 복사할 자료를 제공하는 저장소는 첫 부분에 자료를 볼 수 있는 링크를 둔다.
- 구성, 검증, 문의 안내는 독자가 하려는 일에 필요할 때 배치한다.
- 상세 작업을 연결할 때는 `기존 설치 갱신`처럼 도착할 절의 용도를 링크 이름에 표시한다.
