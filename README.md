# Agent Deck

Stream Deck 키 하나에 Claude Code(또는 Codex) 세션 하나를 연결하는 플러그인입니다.
키에는 픽셀 Claude 마스코트가 세션 상태에 맞춰 움직이고, 키를 누르면 그 세션이 돌고 있는 터미널 창으로 바로 이동합니다.
CPU / RAM 사용량을 보여주는 키도 들어 있습니다.

| 키 색 | 마스코트 | 아래 글자 | 의미 |
| --- | --- | --- | --- |
| 파랑 | 키보드 앞에서 타이핑 | `WORKING 1:23` / `1:23 · Bash` | 작업 중 (경과 시간, 실행 중인 툴 이름) |
| 주황(깜빡임) | 한 팔 흔들며 `!` 말풍선 | `APPROVE?` / `NEEDS YOU` | 권한 승인 대기 / 입력 대기 |
| 주황(깜빡임) | `?` 말풍선 | `QUESTION` | Claude가 질문 중 |
| 초록 | 두 팔 들고 체크 표시 | `DONE` | 턴 종료, 내 입력 차례 |
| 어두운 회색 | 눈 감고 `zzz` | `Zzz` | 자는 중 (이미 확인함 / 세션 시작만 함 / 15분 넘게 방치된 완료) |
| 빨강 | X 눈, 몸 흔들림 | `ERROR` | API 오류로 턴 중단 |

**Next Waiting** 키는 나를 기다리는 세션 수를 보여주고, 누르면 가장 급한 세션(승인 대기 → 오래된 완료 순)으로 이동합니다. 세션이 키보다 많을 때 유용합니다.

**System Monitor** 키는 CPU 사용률(막대 + 최근 36초 그래프)과 RAM 사용률(막대 + 사용/전체 GB)을 1초마다 갱신합니다. 50% 미만 초록, 80% 미만 주황, 그 이상 빨강. 누르면 작업 관리자가 열립니다.

마스코트는 [CodeIsland](https://github.com/wxtsky/CodeIsland)의 "에이전트가 하는 일에 따라 움직이는 픽셀 마스코트" 아이디어를 따랐고, 그림은 이미지 파일 없이 `src/mascot.ts`에서 셀 단위로 합성해 SVG로 그립니다.

## 구조

세션을 아는 경로가 두 가지이고, 둘 다 같은 세션 저장소(`SessionStore`)로 합쳐집니다.

```
[Windows] claude.exe ──┬─ ~/.claude/sessions/<pid>.json ──(1초 폴링)──> Stream Deck 플러그인 (Node)
                       │    pid, cwd, status(busy/idle/waiting)         127.0.0.1:39217
                       └─ hook ──> agent-deck-hook.mjs ──POST──>              │
                            └─ 터미널 제목을 "프로젝트 [cc:세션ID]"로            ├─ 키 그리기 (마스코트)
                                                                              │
[WSL] claude ──hook──> agent-deck-hook.sh ──curl.exe(interop)──>              │
                                                                              │
                       키 누름 → focus-window.ps1 → [cc:세션ID] 제목의 창/탭, 없으면 PID의 부모 체인에서 창 찾기
```

- **세션 레지스트리(hook 없이 동작)**: Claude Code 2.1.119 이상은 실행 중인 세션을 `~/.claude/sessions/<pid>.json`에 기록합니다(`status`: `busy` / `idle` / `waiting`). 플러그인이 이 폴더를 1초마다 읽어서 세션을 찾고, 죽은 PID는 무시합니다. 플러그인만 설치해도 키에 세션이 뜨고 작업 중/자는 중/완료가 표시됩니다.
- **hook(정밀 상태 + 정확한 탭 이동)**: hook을 설치하면 툴 이름, 승인/질문 구분, 오류 상태가 추가되고, 터미널 제목에 `[cc:xxxxxxxx]` 표식이 들어가 Windows Terminal에서 뒤쪽 탭이라도 정확히 찾아갑니다. hook 이벤트가 레지스트리보다 새로우면 hook 쪽 상태가 우선합니다.
- **창 찾기 순서**: ① 제목 표식 `[cc:...]`(창 → Windows Terminal 탭, UI Automation) ② 세션 PID의 부모 프로세스 체인에서 보이는 창을 가진 첫 프로세스(WindowsTerminal.exe, conhost 등) ③ 프로젝트 이름이 제목에 들어간 터미널 창.
- WSL2 기본(NAT) 네트워킹에서는 WSL에서 윈도우의 `127.0.0.1`에 닿지 않아서, 윈도우 쪽 `curl.exe`를 WSL interop으로 호출해 보냅니다. mirrored 네트워킹이면 WSL의 curl로 바로 보냅니다. 둘 다 자동으로 시도합니다.

## 설치

### 1. 플러그인 (Windows, PowerShell)

준비물: Stream Deck 앱 7.0 이상(번들 Node 20 사용), Node.js 20 이상(빌드용).

```powershell
cd <이 폴더>
npm install
npm run build
npm test
```

설치는 둘 중 하나로 합니다.

- **개발용 링크** (코드 고치면서 쓸 때): `npm run link` 후 `npx streamdeck restart com.hbyi.agentdeck`.
  심볼릭 링크를 만들기 때문에 Windows 설정 → 시스템 → 개발자용 → **개발자 모드**가 켜져 있어야 할 수 있습니다. 안 되면 `New-Item -ItemType Junction -Path "$env:APPDATA\Elgato\StreamDeck\Plugins\com.hbyi.agentdeck.sdPlugin" -Target "<이 폴더>\com.hbyi.agentdeck.sdPlugin"`로 정션을 만들고 Stream Deck 앱을 재시작합니다.
- **패키지 설치**: `npm run pack`으로 `com.hbyi.agentdeck.streamDeckPlugin` 파일을 만들고 더블클릭.

Stream Deck 앱의 액션 목록에 **Agent Deck** 카테고리가 생깁니다. **Agent Session**을 원하는 만큼 키에 끌어다 놓고, 필요하면 **Next Waiting**과 **System Monitor**도 놓습니다.

여기까지만 해도 Windows에서 도는 Claude Code 세션은 키에 나타납니다.

### 2. Claude Code hook (Windows 네이티브)

```powershell
node hooks\windows\install.mjs
```

- `%USERPROFILE%\.claude\agent-deck\`에 스크립트를 복사하고 `%USERPROFILE%\.claude\settings.json`에 hook을 추가합니다. 다른 도구의 hook과 기존 설정은 그대로 두고, 바꾸기 전에 백업 파일을 만듭니다. 다시 실행해도 중복되지 않습니다.
- hook은 셸 없이 `node.exe`를 직접 실행하는 exec form으로 등록되므로 Git Bash가 있든 없든 동작합니다.
- `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`도 설정합니다. Claude Code가 터미널 제목을 자기 것으로 덮어쓰면 창 찾기용 표식이 사라지기 때문입니다. 원래 제목 표시를 유지하고 싶으면 `--keep-title` (이 경우 키를 누르면 PID로 창까지는 찾지만 탭은 못 고를 수 있음).
- 실행 중인 Claude Code 세션은 재시작해야 hook이 적용됩니다.
- 제거: `node hooks\windows\install.mjs --uninstall`

### 3. Claude Code hook (WSL)

```bash
cd /mnt/c/<이 폴더 경로>/hooks/wsl
bash install.sh
```

- `~/.claude/agent-deck/`에 스크립트를 복사하고 `~/.claude/settings.json`에 hook을 추가합니다. 기존 설정은 그대로 두고, 바꾸기 전에 백업 파일을 만듭니다.
- 마지막에 플러그인 연결을 확인해서 결과를 알려줍니다. `transport: win`이 나오면 `~/.bashrc`에 `export AGENT_DECK_TRANSPORT=win`을 넣어두면 매번 한 단계를 건너뜁니다.
- 제거: `bash install.sh --uninstall`

### 4. 동작 확인

Claude 없이 키가 바뀌는지 먼저 볼 수 있습니다. Windows에서:

```powershell
npm run simulate          # 가짜 세션이 작업 → 승인 대기 → 완료로 바뀜
npm run simulate -- end   # 가짜 Claude 세션 제거
```

브라우저에서 `http://127.0.0.1:39217/state`를 열면 플러그인이 알고 있는 세션 목록이 JSON으로 보입니다(`pid`가 있으면 레지스트리에서 찾은 세션).

그다음 평소처럼 `claude`를 열면 됩니다. hook을 설치했다면 창 제목이 `프로젝트이름 [cc:1a2b3c4d]`로 바뀝니다.

## 키 배정

- 기본: 고정하지 않은 키들이 **왼쪽 위부터 오른쪽, 아래 순서**로 세션이 열린 순서대로 채워집니다. 세션이 끝나면(`SessionEnd` 또는 프로세스 종료) 키가 비고 뒤 세션들이 당겨집니다.
- 고정: 키를 선택하고 속성 창의 **고정할 프로젝트**에 프로젝트 폴더 이름을 적으면 그 키는 그 프로젝트 세션만 보여줍니다. 일부만 일치해도 됩니다.
- 키 위 이름은 Claude를 시작한 폴더 이름입니다. 바꾸고 싶으면 그 세션을 시작하기 전에 `AGENT_DECK_LABEL=원하는이름`을 환경 변수로 설정합니다(hook 설치 시).

## Codex

Codex는 턴이 끝날 때만 알림(`notify`)을 주기 때문에, 키는 **완료(DONE)** 상태만 정확하고 "작업 중"은 표시되지 않습니다. 마스코트는 연보라색으로 그려집니다. 키를 누르면 프로젝트 이름이 제목에 들어간 터미널 창을 찾아봅니다(최선 노력).

- **WSL에서 돌릴 때** `~/.codex/config.toml`:
  ```toml
  notify = ["/home/<사용자>/.claude/agent-deck/codex-notify.sh"]
  ```
- **Windows 네이티브로 돌릴 때** `%USERPROFILE%\.codex\config.toml` (`install.mjs`가 정확한 줄을 출력해 줍니다):
  ```toml
  notify = ["C:/Program Files/nodejs/node.exe", "C:/Users/<사용자>/.claude/agent-deck/codex-notify.mjs"]
  ```

이미 `notify` 줄이 있으면 하나만 쓸 수 있으니 바꿔야 합니다.

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| 키가 전혀 안 바뀜 | `npm run simulate`로 플러그인부터 확인. 되면 `http://127.0.0.1:39217/state`에 세션이 있는지 확인. 없으면 `~/.claude/sessions/*.json`이 생기는지(Claude Code 2.1.119 이상) 확인. WSL 세션이면 `bash install.sh`를 다시 돌려 연결 확인 결과를 봅니다. |
| 키는 바뀌는데 눌러도 창이 안 옴 (키에 ⚠ 표시) | hook을 설치했다면 창 제목에 `[cc:...]`가 보이는지 확인. 안 보이면 `CLAUDE_CODE_DISABLE_TERMINAL_TITLE`이 적용됐는지, 세션을 재시작했는지 확인. hook 없이 쓸 때는 `/state`의 `pid`가 실제 claude 프로세스인지 확인. |
| 창은 오는데 다른 탭이 보임 | 제목 표식이 없으면 PID로 창만 찾습니다. hook을 설치하면 탭까지 찾아갑니다. |
| 창이 앞으로 안 오고 작업표시줄만 깜빡임 | Windows의 포커스 가로채기 방지 때문입니다. 스크립트가 세 가지 방법을 차례로 시도하지만 막힐 수 있습니다. |
| 포트 충돌 | 플러그인 로그(`com.hbyi.agentdeck.sdPlugin/logs`)에 "already in use"가 있으면 `src/config.ts`의 포트와 hook의 `AGENT_DECK_PORT`를 같은 값으로 바꿉니다. |
| 끝낸 세션이 키에 남아 있음 | 레지스트리로 찾은 세션은 프로세스가 사라지면 바로 지워집니다. hook만으로 알던(WSL, Codex) 세션은 12시간 동안 아무 이벤트가 없으면 자동으로 지워지고, 플러그인 재시작으로도 비울 수 있습니다. Stream Deck 7.0에서는 `npx streamdeck restart com.hbyi.agentdeck`가 돌고 있는 플러그인을 다시 띄우지 않을 때가 있으니, 그럴 땐 Stream Deck 앱 자체를 종료 후 다시 실행합니다. |
| 플러그인이 로드되지 않음 | Stream Deck 앱 버전(7.0 이상)과 `%ProgramFiles%\Elgato\StreamDeck\node\`에 `node20.exe`가 있는지 확인. manifest의 `Nodejs.Version`은 `"20"`입니다. |

## 파일

```
src/
  plugin.ts            진입점: 서버 시작, 레지스트리 감시, 액션 등록
  sessions.ts          hook 이벤트 + 레지스트리 → 세션 상태 (순서 뒤바뀐 이벤트 무시, 둘의 병합 규칙)
  registry.ts          ~/.claude/sessions/*.json 읽기, PID 생존 확인, 폴링
  server.ts            127.0.0.1:39217, POST /claude, POST /codex, GET /state
  deck.ts              키 ↔ 세션 배정, 그리기, 키 누름 처리, 500ms 애니메이션 tick
  render.ts            키 이미지(SVG): 세션 키, Next Waiting 키, System Monitor 키
  mascot.ts            픽셀 마스코트 장면(상태별 프레임) → SVG rect
  sysmon.ts            CPU/RAM 샘플링
  focus.ts             창 찾기 호출 (Windows)
  actions/             Agent Session, Next Waiting, System Monitor 액션
com.hbyi.agentdeck.sdPlugin/
  manifest.json
  scripts/focus-window.ps1   제목 표식 / PID / 프로젝트 이름으로 창·탭 찾아서 앞으로
  ui/session-slot.html       키 속성 창 (고정할 프로젝트)
hooks/windows/         Windows 네이티브 Claude Code hook, Codex notify, 설치 스크립트
hooks/wsl/             WSL Claude Code hook, Codex notify, 설치 스크립트
tests/                 node:test 단위 테스트 (npm test)
tools/simulate.mjs     가짜 세션으로 키 확인
```

## 다음에 해볼 만한 것

- **키로 권한 승인**: `PermissionRequest`를 HTTP hook으로 플러그인에 직접 보내고, 키 누름으로 allow/deny 응답을 돌려주면 됩니다. hook이 응답을 기다리는 동안 Claude가 멈춰 있으므로 타임아웃 처리가 핵심입니다.
- **Mac 지원**: `focus.ts`에 macOS 분기만 추가하면 됩니다. tmux를 쓴다면 hook에서 `$TMUX_PANE`을 함께 보내고 `tmux switch-client`로 전환하는 방식이 가장 깔끔합니다.
- **Stream Deck+ 다이얼**: 돌려서 세션 순환, 눌러서 이동.
