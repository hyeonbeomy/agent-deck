# Claude 앱 키 · 폴더에서 Claude 시작 키 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 키 하나로 Claude 데스크톱 앱을 앞으로 가져오고(꺼져 있으면 실행), 다른 키 하나로 포커스된 탐색기 폴더에서 Windows Terminal → WSL → `claude`를 띄운다.

**Architecture:** 두 기능 모두 "액션 클래스(TS) + PowerShell 헬퍼 스크립트" 구조로, 세션 키의 `focus-window.ps1`과 같은 방식이다. 창 찾기·포커스용 C# 코드와 함수는 `scripts/agent-deck-win.ps1`로 빼서 세 스크립트가 공유한다. TS 쪽은 `src/powershell.ts`가 스크립트 실행(인자 조립, 종료 코드·stderr·소요 시간 수집)을 맡고, 액션은 결과에 따라 키에 ✓/⚠를 표시한다.

**Tech Stack:** TypeScript, @elgato/streamdeck 3.x, PowerShell 5.1(Add-Type C#, Shell.Application COM, UI Automation), Windows Terminal CLI(`wt.exe`), WSL(`wsl.exe --cd`), node:test + tsx, PIL(아이콘 1회 생성).

## Global Constraints

- manifest `Nodejs.Version` `"20"`, `Software.MinimumVersion` `"7.0"` 유지. 새 액션 UUID: `com.hbyi.agentdeck.claudeapp`, `com.hbyi.agentdeck.claudehere`.
- PowerShell 스크립트는 ASCII만 사용(5.1이 BOM 없는 파일을 ANSI로 읽음). 콘솔에 붙은 동안 출력 금지.
- 스크립트 종료 코드: 0 성공, 1 대상 없음/실행 실패, 2 창은 찾았으나 Windows가 전환 거부.
- 기존 세션 키의 창 이동 동작은 그대로여야 한다(`POST /focus`로 회귀 확인).
- 테스트 러너: `node --import tsx --test "tests/**/*.test.ts"`.

## 설계 메모 (2026-11-09 검토 결과)

- Claude 데스크톱 앱: 이 PC는 Microsoft Store 버전(`Claude_pzs8sxrjxfjjc`), 메인 프로세스 창 제목 "Claude", `claude://` 핸들러 등록. 실행 명령 우선순위: ① `shell:AppsFolder\<PackageFamilyName>!Claude` ② `%LOCALAPPDATA%\AnthropicClaude\claude.exe` ③ `claude://`. 앱이 단일 인스턴스라 이미 떠 있으면 재실행이 창을 다시 보여준다. 그래도 창이 안 보이면 숨겨진 메인 창을 ShowWindow로 복원.
- 실행 여부 표시: `tasklist /FI "IMAGENAME eq claude.exe" /FI "WINDOWTITLE eq Claude" /FO CSV /NH`가 데스크톱 앱 메인 프로세스만 돌려준다(CLI `claude.exe`는 창이 없어 제외). 키가 보이는 동안 5초마다 폴링.
- 탐색기 폴더: `Shell.Application.Windows()`가 창 핸들(HWND)과 현재 폴더 경로, 선택 항목을 준다(확인함). Windows 11 탭은 같은 HWND로 여러 항목이 오므로 UI Automation으로 선택된 탭 이름을 읽어 맞춘다. 가상 폴더(빠른 액세스 등)는 `Test-Path -PathType Container`로 걸러 기본 폴더로 대체.
- 폴더 결정 순서: 포그라운드 탐색기 창(선택된 하위 폴더 하나면 그 폴더) → 마우스 커서 아래 탐색기 창 → 바탕화면(Progman/WorkerW)이면 바탕화면 폴더 → 설정의 기본 폴더 → 사용자 홈.
- 실행: `wt.exe -w 0|new new-tab --title "claude: <폴더명>" -d <폴더> [-p <프로필>] wsl.exe [-d <배포판>] --cd <폴더> -- bash -lic "claude"` (`--keepShell`이면 `claude; exec bash -i`). 이 PC: 기본 배포판 Ubuntu, `bash -lic`에서 `claude`가 Windows claude로 잡힘(확인함). wt.exe가 없으면 `wsl.exe`를 새 콘솔로 직접 실행.

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `scripts/agent-deck-win.ps1` (신규) | C# `AgentDeckWin`(창 찾기/포커스/콘솔 제목/커서 아래 창/클래스명) + `Try-Focus`, `Select-TerminalTab`, `Get-TitleNeedle` |
| `scripts/focus-window.ps1` (수정) | 공용 모듈 dot-source, 세션 창 찾기 로직만 남김 |
| `scripts/claude-app.ps1` (신규) | Claude 앱 창 포커스, 없으면 실행 후 대기·포커스. `-DryRun` |
| `scripts/claude-here.ps1` (신규) | 폴더 결정 → wt/wsl 실행 → 새 탭 포커스. `-DefaultFolder -Distro -Profile -NewWindow -KeepShell -DryRun` |
| `src/powershell.ts` (신규) | `scriptPath`, `powershellArgs`, `runScript` → `ScriptResult {ok, code, detail, ms}` |
| `src/focus.ts` (수정) | `runScript` 사용 |
| `src/claude-app.ts` (신규) | `TASKLIST_ARGS`, `parseTasklist` |
| `src/claude-here.ts` (신규) | `ClaudeHereSettings`, `claudeHereArgs` |
| `src/actions/claude-app.ts`, `src/actions/claude-here.ts` (신규) | 액션: 그리기, 폴링, 키 누름 → 스크립트 → ✓/⚠ |
| `src/render.ts` (수정) | `renderClaudeApp(running)`, `renderClaudeHere()` |
| `src/config.ts` (수정) | `CLAUDE_APP_POLL_MS`, LABELS 추가 |
| `src/plugin.ts` (수정) | 액션 등록 |
| `manifest.json`, `imgs/actions/claudeapp/*`, `imgs/actions/claudehere/*`, `ui/claude-here.html` | 액션 등록, 아이콘, 속성 창 |
| `tests/powershell.test.ts`, `tests/claude-app.test.ts`, `tests/claude-here.test.ts`, `tests/render.test.ts` | 단위 테스트 |
| `README.md` | 키 설명, 설정, 문제 해결 |

## Tasks

### Task 1: 스크립트 실행 공통화
- [x] `tests/powershell.test.ts` 작성 → 실패 확인
- [x] `src/powershell.ts` 구현, `src/focus.ts`가 이를 사용하도록 변경 → 테스트 통과

### Task 2: Claude 앱 키
- [x] `tests/claude-app.test.ts`(`parseTasklist`), `tests/render.test.ts`(`renderClaudeApp`) → 실패 확인
- [x] `src/claude-app.ts`, `renderClaudeApp`, `src/actions/claude-app.ts`, manifest, 아이콘 → 테스트 통과
- [x] `scripts/agent-deck-win.ps1` 분리 + `scripts/claude-app.ps1`; 수동 확인: `-DryRun` 출력, 실행 중인 앱 창이 앞으로 옴, `POST /focus` 회귀 없음

### Task 3: 폴더에서 Claude 시작 키
- [x] `tests/claude-here.test.ts`(`claudeHereArgs`), `renderClaudeHere` 테스트 → 실패 확인
- [x] `src/claude-here.ts`, `renderClaudeHere`, `src/actions/claude-here.ts`, `ui/claude-here.html`, manifest, 아이콘 → 테스트 통과
- [x] `scripts/claude-here.ps1`; 수동 확인: 탐색기 창을 띄운 상태의 `-DryRun`이 그 폴더와 wt 명령을 출력, 실제 실행 시 WSL 탭에서 claude가 뜨고 세션 키에 나타남

### Task 4: 배선, 문서, 배포
- [x] `plugin.ts` 등록, `npm run build`, `npx streamdeck validate`, Stream Deck 앱 재시작
- [x] README 갱신(키 설명, 설정, 문제 해결), 버전 0.3.0
- [x] 커밋 · push

## 구현 중 추가·변경된 것

- **자동 마운트(사용자 추가 요청)**: WSL이 변환하지 못하는 위치(NAS 공유, 네트워크 드라이브, Google Drive)는 `wsl -u root`로 `drvfs` 마운트 후 연다. 접근 가능 여부는 `wslpath -u`의 종료 코드로 판별한다. `wsl --cd <윈도우 경로>`는 변환에 실패해도 홈으로 떨어지며 0을 돌려줘서 판별에 쓸 수 없었다.
- wt에는 `-d`를 주지 않고 `wsl.exe --cd <리눅스 경로>`만 쓴다. `-KeepShell`의 내부 명령은 세미콜론 없이 `claude || true && exec bash -i`로 한다(Windows Terminal이 `;`를 자체 명령 구분자로 해석).
- PowerShell 매개변수 이름은 `-TerminalProfile`이다(`-Profile`은 자동 변수 `$PROFILE`을 가린다).
- `POST /press`(디버그)와 `Origin` 헤더가 있는 POST 거부를 추가했다.
- 검증(2026-11-09, 플러그인 프로세스 경유): `/focus` 회귀 정상, `/press claudeapp`으로 Claude 창이 앞으로 옴, `/press claudehere`로 `G:\내 드라이브`가 `/mnt/g`에 마운트되고 새 탭에서 claude가 뜸. Store 앱 재실행 명령이 실행 중인 창을 앞으로 가져오는 것도 확인.
