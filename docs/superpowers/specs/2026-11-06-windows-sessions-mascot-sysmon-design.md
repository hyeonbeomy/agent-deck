# Agent Deck: Windows 세션 감지 · Claude 마스코트 키 · CPU/RAM 키 설계

날짜: 2026-11-06
참고: [wxtsky/CodeIsland](https://github.com/wxtsky/CodeIsland) — hook 기반 세션 감지, 상태별 픽셀 마스코트 애니메이션, 클릭 시 터미널로 이동.

## 1. 목표

1. 이 PC(Windows 네이티브 `claude.exe`)에서 Claude Code 세션이 생기면 Stream Deck 키에 자동으로 나타난다.
2. 키에는 Claude 캐릭터(픽셀 마스코트)가 세션 상태에 맞춰 움직인다: 일하는 중 / 자는 중 / 완료 / 승인·질문 대기 / 오류.
3. 키를 누르면 그 세션이 돌고 있는 터미널 창(가능하면 Windows Terminal 탭까지)이 앞으로 온다.
4. CPU / RAM 사용량을 보여주는 키를 추가한다.

## 2. 현재 상태와 문제

- 기존 플러그인은 WSL 안의 Claude Code hook(`hooks/wsl/`)만 지원한다. 이 PC는 Windows 네이티브 `claude.exe`(Windows Terminal)로 세션을 돌리므로 플러그인은 세션을 전혀 보지 못한다.
- 키는 텍스트(`WORKING 1:23` 등)만 그린다.
- 설치된 Stream Deck 앱은 7.0.3이고 번들 Node 런타임은 `node20.exe`뿐이다. manifest는 Node 24 / 앱 7.1 이상을 요구하므로 이 PC에서는 로드되지 않는다.
- CPU/RAM 키가 없다.

## 3. 세션 감지 (Windows)

두 가지 소스를 합친다. 둘 다 `claude:<session_id>` 키로 같은 세션에 합쳐진다.

### 3.1 세션 레지스트리 감시 (hook 설치 없이도 동작)

Claude Code 2.1.119+는 실행 중인 세션을 `%USERPROFILE%\.claude\sessions\<pid>.json`에 기록한다.
확인된 필드: `pid`, `sessionId`, `cwd`, `name`, `kind`("interactive"), `entrypoint`("cli"), `startedAt`, `status`(`busy` | `idle` | `waiting`), `statusUpdatedAt`.

- 새 모듈 `src/registry.ts`의 `RegistryWatcher`가 1초마다 디렉터리를 폴링한다(`*.json`만, `.key` 무시).
- 파일이 남아 있어도 PID가 죽었으면(`process.kill(pid, 0)` 실패) 무시한다.
- 상태 매핑: `busy` → `working`, `waiting` → `attention`(kind `input`), `idle` → 직전이 working/attention이면 `done`, 아니면 유지(`ready`).
- hook이 더 정확하므로 `statusUpdatedAt > lastHookTs`일 때만 레지스트리 상태를 적용한다. 같은 status를 반복 적용하지 않는다(`seen`이 초기화되는 것을 막기 위해).
- 레지스트리에서 발견된 세션은 파일이 사라지거나 PID가 죽으면 제거한다.
- `kind`가 있고 `interactive`가 아니면 건너뛴다(헤드리스/SDK 세션 제외).

### 3.2 Windows 네이티브 hook (정밀 상태 + 창 찾기용 제목 표식)

`hooks/windows/agent-deck-hook.mjs`: WSL hook과 같은 역할을 Node로 구현한다.

- stdin의 hook payload에 `deck: {token, label, ts}`를 붙여 `POST /claude`.
- `SessionStart` / `UserPromptSubmit` / `Stop`에서 `{"terminalSequence": "\u001b]0;<label> [cc:xxxxxxxx]\u0007"}`를 출력해 터미널 제목에 표식을 넣는다(Claude Code가 허용하는 OSC 0).
- 설치 스크립트 `hooks/windows/install.mjs`:
  - hook 스크립트를 `%USERPROFILE%\.claude\agent-deck\`에 복사.
  - `~/.claude/settings.json`에 exec form(`command` + `args`, 셸 미사용)으로 hook을 추가. 기존 hook(예: Notchcode)은 그대로 두고, 이전 Agent Deck 항목만 교체한다(멱등). 수정 전 백업.
  - sync: SessionStart / UserPromptSubmit / Stop (timeout 5). async: PreToolUse / PostToolUse / PostToolUseFailure / PermissionRequest / Notification / StopFailure / SessionEnd.
  - `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` 설정(`--keep-title`로 생략). `--uninstall` 지원.
  - 설정 병합 로직은 `hooks/windows/settings-merge.mjs`의 순수 함수로 분리해 테스트한다.

## 4. 마스코트 렌더링

새 모듈 `src/mascot.ts`:

- 36×20 셀 캔버스(셀 4px → 144×80px)에 코드로 합성한다: 몸통(주황 네모 + 네모 눈) · 팔 · 키보드 · 소품(zzz, !, ?, 체크, 반짝임).
- 출력은 같은 색 가로 run을 `<rect>`로 묶은 SVG 조각(`shape-rendering="crispEdges"`).
- 상태별 장면:

| 상태 | 장면 | 프레임 |
| --- | --- | --- |
| working | 키보드 앞에서 타이핑. 몸통 들썩, 팔 교대, 눌린 키 이동 | 3 |
| ready / done(seen) | 눈 감고 늘어진 자세, `z z Z` 떠오름 | 3 |
| done (unseen) | 팔 들고 웃는 눈, 초록 체크 + 반짝임 | 2 |
| attention (permission / input) | 한 팔 흔들기, 노란 `!` 말풍선 | 2 |
| attention (question) | 같은 동작, `?` 말풍선 | 2 |
| error | X 눈, 몸통 좌우 흔들림 | 2 |

- Codex 세션은 몸통 색만 바꾼다(연보라).
- 키 레이아웃: 위 프로젝트 이름(16px) → 가운데 마스코트(y 28–108) → 아래 상태 줄(13px: `1:23 · Bash`, `Zzz`, `DONE`, `APPROVE?`, `QUESTION`, `NEEDS YOU`, `ERROR`). 상태별 배경색·펄스 테두리는 기존 팔레트 유지.
- 애니메이션: `Deck`의 tick을 500ms로 바꾸고 tick 카운터로 프레임을 고른다. 세션이 하나라도 있으면 매 tick 렌더하되, 이미지 문자열이 같으면 `setImage`를 생략한다(기존 캐시).
- done 상태가 15분 동안 unseen이면 자동으로 seen 처리해 잠자기로 넘어간다.

## 5. 창 포커스

`focus.ts` → `scripts/focus-window.ps1` 탐색 순서:

1. `-Match` 제목 표식 `[cc:xxxxxxxx]` (hook 설치 시) — 창, 그리고 Windows Terminal 탭(UI Automation).
2. `-ProcessId` (레지스트리에서 얻은 claude PID) — 부모 프로세스를 거슬러 올라가 보이는 최상위 창을 가진 첫 프로세스(WindowsTerminal.exe, conhost.exe, mintty 등)의 창을 앞으로. 탭까지는 못 고르지만 창은 맞는다.
3. `-Fallback` 프로젝트 이름 (터미널 창만).

## 6. CPU / RAM 키

새 액션 `com.hbyi.agentdeck.sysmon` (`src/actions/sys-monitor.ts`, `src/sysmon.ts`):

- `SystemSampler`: `os.cpus()` 누적 시간 차분으로 CPU %, `os.totalmem()/os.freemem()`으로 RAM %. 1초 샘플, 최근 36개 CPU 이력 보관. 키가 하나라도 보일 때만 샘플링.
- 렌더: `CPU 42%` 막대 + 이력 스파크라인, `RAM 61%` 막대 + `9.8 / 31.9 GB`. 막대 색은 50% 미만 초록, 80% 미만 주황, 이상 빨강.
- 키 누름: 작업 관리자(`taskmgr.exe`) 실행. macOS는 Activity Monitor.
- 순수 계산(`cpuPercent`, `ramPercent`, 포맷)은 테스트한다.

## 7. 빌드 · 설치

- manifest: `Nodejs.Version` `"20"`, `Software.MinimumVersion` `"7.0"` (이 PC의 앱 7.0.3 / node20 기준). 액션 추가: System Monitor (아이콘 PNG 생성).
- 테스트: `node --import tsx --test` (devDependency `tsx`). 대상: 레지스트리 상태 매핑, 마스코트 장면 무결성, sysmon 계산, 설정 병합.
- 설치: `npm run build` → Stream Deck Plugins 폴더에 링크(junction) → 플러그인 재시작 → `node hooks/windows/install.mjs`.
- README에 Windows 네이티브 설치 절차와 마스코트 표를 추가한다.

## 8. 범위 밖

- 키로 권한 승인/답변 보내기 (hook 응답 대기 필요).
- macOS 포커스.
- Windows Terminal에서 PID만으로 탭 선택 (API 없음).
