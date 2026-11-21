---
name: humanize-windows-runtime
description: Windows에서 humanize-korean의 원본 윤문 스크립트를 실행할 때, 준비·윤문·검증 도구 호출과 협업 에이전트에 같은 작업 경로와 Python 실행 파일을 넘긴다.
---

# Windows에서 한국어 윤문 실행

Windows에서 `humanize-korean`을 선택한 경우에 사용한다.
원본 스킬의 경로 선택·윤문·검사 기준을 따르고 경로와 Python만 이 절차로 정한다.

1. 단계 사이에 유지되는 쓸 수 있는 경로를 한 번 선택한다.
   사용자가 작업 위치를 지정하면 그 위치를 사용한다.
   Windows 사용자 임시 폴더를 요청했으면 `[Environment]::GetEnvironmentVariable('TEMP', 'User')`에서 얻은 경로에 요청한 폴더를 붙인다.
   기본으로 쓰는 위치는 Git 제외를 확인한 로컬 산출물 경로나 Git 작업 트리 밖의 쓰기 가능한 작업 폴더다.
   Desktop 도구마다 바뀔 수 있는 `$env:TEMP`·`$env:TMP`·`GetTempPath()`는 피한다.
2. 이 스킬의 [scripts/prepare.ps1](scripts/prepare.ps1)을 PowerShell에서 호출한다.
   `-SkillRoot`에는 설치된 원본 `humanize-korean/SKILL.md`의 부모 절대 경로를 전달한다.
   `-ScratchRoot`에는 1단계에서 정한 절대 경로를 전달한다.
   `-InputText`에는 수정 전 원고를, `-Genre`에는 원본 스킬의 장르 키를 전달한다.
   필요하면 `-Python`에 확인한 Python 실행 파일의 절대 경로를 지정한다.
3. 반환된 `runDir`, `python`, `route`를 사용한다.
   다음 도구 호출에서 `runDir`의 `01_input_with_metrics.txt`를 읽고 이 폴더의 `final.md`에 윤문본을 저장한다.
   협업 에이전트에게도 이 절대 경로와 역할 파일을 전달한다.
   진단·청크 준비가 추가될 때도 같은 `runDir`를 사용한다.
4. 같은 폴더의 `01_input.txt`와 `final.md`를 원본 `verify_gates.py`의 `--before`, `--after`에 절대 경로로 전달한다.
   `python` 경로와 `-B -X utf8` 옵션을 재사용한다.
   원문과 대조하고 사용자가 요청한 산출물 정리 범위를 따른다.
