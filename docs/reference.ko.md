# Agent Deck 상세 문서

[English](reference.md) | **한국어** · [README](../README.ko.md)로 돌아가기

README에 싣지 않은 세부 내용입니다: 각 키의 정확한 동작, 창 찾는 방식, hook, Codex, 디버그, 동작 원리, 문제 해결, 소스 구조.

## 키 상세

### Agent Session

- 키 위의 이름은 Claude를 시작한 폴더 이름입니다. hook을 설치했다면 세션을 시작하기 전에 `AGENT_DECK_LABEL=원하는이름`을 설정해 바꿀 수 있습니다.
- 작업 중에는 경과 시간이 표시되고, hook이 있으면 실행 중인 툴도 함께 나옵니다: `1:23 · Bash`.
- 완료된 턴은 키를 누르기 전까지(누르면 "확인함"으로 표시되고 잠듭니다), 또는 15분이 지나기 전까지 `DONE`으로 남습니다.
- 고정하지 않은 키들은 왼쪽 위부터 오른쪽, 아래 순서로 세션이 열린 순서대로 채워집니다. 세션이 끝나면 키가 비고 뒤 세션들이 당겨집니다.
- 고정: 속성 창의 **고정할 프로젝트**에 프로젝트 폴더 이름을 적습니다. 이름 일부만 일치해도 됩니다.

### Next Waiting

- 기다리는 세션이 없으면 `0` **ALL CLEAR**, 있으면 세션 수와 **WAITING**, 가장 급한 세션 이름. 승인·질문 대기가 있으면 주황색으로 깜빡이고, 확인 안 한 완료만 있으면 초록색입니다.
- 순서: 승인·질문·입력 대기 → 오류 → 확인하지 않은 완료. 같은 등급이면 오래된 것부터.
- 누르면 그 세션을 확인함으로 표시하므로, 연달아 누르면 급한 순서대로 하나씩 돌아볼 수 있습니다.

### System Monitor

CPU 사용률(막대 + 최근 36초 그래프)과 RAM 사용률(막대 + 사용/전체 GB)을 1초마다 갱신합니다. 50% 미만 초록, 80% 미만 주황, 그 이상 빨강.

### Claude App

- 실행 여부 점은 키가 보이는 동안 5초마다 확인합니다.
- Microsoft Store 버전과 설치 파일 버전(`%LOCALAPPDATA%\AnthropicClaude`)을 모두 찾습니다. 터미널에서 도는 Claude Code도 `claude.exe`인데, 설치 경로와 창 유무로 구분합니다.
- 앱이 꺼져 있거나 트레이로 숨어 있으면 실행하고 창이 뜰 때까지 최대 10초 기다립니다.

### Claude Here

- **폴더**: ① 포커스된 파일 탐색기 창의 현재 폴더(하위 폴더 하나만 선택했으면 그 폴더) ② 마우스 커서 아래의 탐색기 창 ③ 바탕화면이면 바탕화면 폴더 ④ 키 설정의 기본 폴더 ⑤ 사용자 홈 폴더. 빠른 액세스나 내 PC 같은 가상 위치는 건너뜁니다. Windows 11 탐색기 탭은 UI Automation으로 구분합니다.
- **자동 마운트**: WSL은 고정 로컬 드라이브만 자동으로 마운트합니다. WSL이 폴더 경로를 변환하지 못하면(`wslpath` 실패) 드라이브나 공유를 먼저 `drvfs`로 마운트합니다. `wsl -u root`로 실행하므로 암호를 묻지 않습니다. 드라이브 `X:\...`는 `/mnt/x`, 공유 `\\서버\공유\...`는 `/mnt/서버-공유`에 마운트하며, WSL이 종료될 때까지 유지됩니다.
- **실행 명령**: `wt.exe -w 0 new-tab --title "claude: <폴더>" wsl.exe --cd <리눅스 경로> -- bash -lic claude`. Windows Terminal이 없으면 일반 콘솔 창에서 `wsl.exe`를 실행합니다.
- **설정**: 기본 폴더, WSL 배포판(비우면 기본 배포판), 터미널 프로필(새 탭의 모양용), 새 창에서 열기, claude가 끝나도 셸 열어 두기.
- 새 세션은 Claude가 폴더 신뢰 확인을 통과한 뒤 Agent Session 키에 나타납니다. 그 전에는 Claude Code가 세션을 기록하지 않기 때문입니다.

## 창을 찾는 순서

세션 키를 누르면 다음 순서로 창을 찾습니다.

1. hook이 터미널 제목에 넣은 표식 `[cc:xxxxxxxx]`가 있는 창 또는 Windows Terminal 탭 (hook 설치 시, 가장 정확)
2. 세션 프로세스가 붙어 있는 콘솔의 제목. Claude Code가 제목을 `◐ 대화 요약` 식으로 바꿔 두므로, 같은 제목의 터미널 창이나 Windows Terminal 탭을 찾아 그 탭을 선택합니다. 탐색기나 시작 메뉴에서 띄운 터미널, 창이 여러 개인 Windows Terminal에서도 맞는 탭으로 갑니다.
3. 세션 프로세스의 부모 체인에서 창을 가진 첫 프로그램(Windows Terminal, conhost, VS Code 등). explorer.exe 같은 셸·시스템 프로세스는 건너뜁니다. 창까지만 찾고 탭은 고르지 못합니다.
4. 프로젝트 이름이 제목에 들어간 터미널 창 (Codex용 최선 노력)

창을 못 찾거나 Windows가 전환을 거부하면 키에 ⚠가 잠깐 뜹니다.

## Hook

hook 없이도 기본 기능은 다 됩니다. hook을 설치하면 승인과 질문의 구분, 툴 이름, 오류 상태가 추가되고, 터미널 제목에 `[cc:xxxxxxxx]` 표식이 들어가 제목이 같은 세션들도 구분합니다.

**Windows (PowerShell)**

```powershell
node hooks\windows\install.mjs
```

- `%USERPROFILE%\.claude\agent-deck\`에 스크립트를 복사하고 `%USERPROFILE%\.claude\settings.json`에 hook을 추가합니다. 다른 도구의 hook과 기존 설정은 그대로 두고, 바꾸기 전에 백업 파일을 만듭니다. 다시 실행해도 중복되지 않습니다.
- hook은 셸 없이 `node.exe`를 직접 실행하는 exec form이라 Git Bash가 있든 없든 동작합니다.
- `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`도 설정합니다. Claude Code가 터미널 제목을 덮어쓰면 표식이 사라지기 때문입니다. 원래 제목을 유지하려면 `--keep-title`을 붙입니다(이 경우 탭은 콘솔 제목으로 찾습니다).
- 실행 중인 세션은 재시작해야 hook이 적용됩니다.
- 제거: `node hooks\windows\install.mjs --uninstall`

**WSL (WSL 안에 설치한 Linux용 claude)**

```bash
cd /mnt/c/<저장소 경로>/hooks/wsl
bash install.sh
```

- `~/.claude/agent-deck/`에 스크립트를 복사하고 `~/.claude/settings.json`에 hook을 추가합니다. 기존 설정은 그대로 두고 백업 파일을 만듭니다.
- 마지막에 플러그인 연결을 확인합니다. `transport: win`이 나오면 `~/.bashrc`에 `export AGENT_DECK_TRANSPORT=win`을 넣어두면 매번 한 단계를 건너뜁니다.
- WSL2 기본(NAT) 네트워킹에서는 WSL에서 Windows의 `127.0.0.1`에 닿지 않아 Windows 쪽 `curl.exe`를 interop으로 호출합니다. mirrored 네트워킹이면 WSL의 curl로 바로 보냅니다. 둘 다 자동으로 시도합니다.
- 제거: `bash install.sh --uninstall`

## Codex

Codex는 턴이 끝날 때만 알림(`notify`)을 주기 때문에 키는 **완료(DONE)** 만 정확하고 "작업 중"은 표시되지 않습니다. 마스코트는 연보라색으로 그려집니다. 키를 누르면 프로젝트 이름이 제목에 들어간 터미널 창을 찾아봅니다.

- Windows 네이티브: `%USERPROFILE%\.codex\config.toml` (`node hooks\windows\install.mjs`가 정확한 줄을 출력해 줍니다)
  ```toml
  notify = ["C:/Program Files/nodejs/node.exe", "C:/Users/<사용자>/.claude/agent-deck/codex-notify.mjs"]
  ```
- WSL: `~/.codex/config.toml`
  ```toml
  notify = ["/home/<사용자>/.claude/agent-deck/codex-notify.sh"]
  ```

`notify` 줄은 하나만 쓸 수 있으니, 이미 있으면 바꿔야 합니다.

## 동작 확인과 디버그

```powershell
npm run simulate          # 가짜 세션이 작업 → 승인 대기 → 완료로 바뀜
npm run simulate -- end   # 가짜 세션 제거
```

- `http://127.0.0.1:39217/state`: 플러그인이 알고 있는 세션 목록(JSON). `pid`가 있으면 세션 레지스트리에서 찾은 세션입니다.
- 창 이동 재현: `curl -X POST http://127.0.0.1:39217/focus -d "{\"pid\":1234}"` (또는 `{"key":"claude:..."}`, `{"label":"프로젝트"}`). 키를 누른 것과 같은 경로로 창을 띄우고 `ok`, 스크립트 종료 코드 `code`(0 성공, 1 못 찾음, 2 전환 거부), 소요 시간 `ms`를 돌려줍니다.
- Claude App / Claude Here 재현: `curl -X POST http://127.0.0.1:39217/press -d "{\"action\":\"claudeapp\"}"`, `curl -X POST http://127.0.0.1:39217/press -d "{\"action\":\"claudehere\",\"settings\":{\"defaultFolder\":\"C:/work\"}}"`. Claude Here의 `detail`에는 고른 폴더, 고른 이유(`source`), WSL 경로, 마운트 여부가 들어 있습니다.
- 스크립트를 직접 시험할 때는 `-DryRun`을 붙이면 아무것도 실행하지 않고 고른 폴더와 실행할 명령만 출력합니다: `powershell -File com.hbyi.agentdeck.sdPlugin\scripts\claude-here.ps1 -DryRun`
- 웹 페이지가 보내는 POST(`Origin` 헤더가 있는 요청)는 403으로 거부합니다. hook과 curl은 영향이 없습니다.
- 플러그인 로그: `com.hbyi.agentdeck.sdPlugin/logs/`. 창 이동은 `focused ...` / `could not focus ...`, Claude Here는 `claude started: folder=...` 줄로 남습니다.

## 동작 원리

세션을 아는 경로가 두 가지이고, 둘 다 같은 세션 저장소로 합쳐집니다.

```
[Windows] claude.exe ──┬─ ~/.claude/sessions/<pid>.json ──(1초 폴링)──> Stream Deck 플러그인 (Node)
                       │    pid, cwd, status(busy/idle/waiting)         127.0.0.1:39217
                       └─ hook ──> agent-deck-hook.mjs ──POST──>              │
                            └─ 터미널 제목을 "프로젝트 [cc:세션ID]"로            ├─ 키 그리기 (마스코트)
                                                                              │
[WSL] claude ──hook──> agent-deck-hook.sh ──curl.exe(interop)──>              │
                                                                              │
                       키 누름 → focus-window.ps1 → [cc:세션ID] 제목의 창/탭 → PID의 콘솔 제목과 같은 창/탭 → PID의 부모 체인에서 창
```

- **세션 레지스트리(hook 없이 동작)**: Claude Code 2.1.119 이상은 실행 중인 세션을 `~/.claude/sessions/<pid>.json`에 기록합니다(`status`: `busy` / `idle` / `waiting`). 플러그인이 이 폴더를 1초마다 읽어 세션을 찾고, 죽은 PID는 무시합니다. 키에는 터미널에서 실행한 세션(`entrypoint: cli`)만 올립니다. Claude 데스크톱 앱이 내부적으로 띄우는 Claude Code 프로세스(`entrypoint: claude-desktop`)는 화면에서 닫은 뒤에도 백그라운드에 남아 있어서 제외합니다. 바꾸려면 `src/config.ts`의 `HIDDEN_ENTRYPOINTS`를 고칩니다.
- **hook**: 툴 이름, 승인/질문 구분, 오류 상태를 추가하고 터미널 제목에 표식을 넣습니다. hook 이벤트가 레지스트리보다 새로우면 hook 쪽 상태가 우선합니다.
- 마스코트는 이미지 파일 없이 `src/mascot.ts`에서 셀 단위로 합성해 SVG로 그립니다. 키 이미지는 내용이 바뀔 때만 장치로 보냅니다.

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| 키가 전혀 안 바뀜 | `npm run simulate`로 플러그인부터 확인. 되면 `http://127.0.0.1:39217/state`에 세션이 있는지 확인. 없으면 `~/.claude/sessions/*.json`이 생기는지(Claude Code 2.1.119 이상, Windows 버전) 확인. WSL의 Linux용 claude라면 `bash install.sh`를 다시 돌려 연결 확인 결과를 봅니다. |
| 키는 바뀌는데 눌러도 창이 안 옴 (키에 ⚠ 표시) | 플러그인 로그의 `could not focus ... exit N` 줄을 봅니다. 1 = 창을 못 찾음, 2 = 찾았지만 Windows가 전환을 거부. `POST /focus`로 같은 동작을 재현할 수 있습니다. hook을 설치했다면 창 제목에 `[cc:...]`가 보이는지, `CLAUDE_CODE_DISABLE_TERMINAL_TITLE`이 적용됐는지, 세션을 재시작했는지 확인. hook 없이 쓸 때는 `/state`의 `pid`가 실제 claude 프로세스인지 확인. |
| 눌러도 아무 일이 없고 ⚠도 안 뜸 | 0.2.0까지는 탐색기에서 띄운 터미널의 부모 체인이 explorer.exe에서 끝나 바탕화면을 "포커스"하고 성공으로 끝났습니다. 0.2.1부터는 콘솔 제목으로 찾고 셸 프로세스는 건너뜁니다. 새 빌드로 플러그인을 다시 띄웠는지 확인하세요. |
| 창은 오는데 다른 탭이 보임 | 콘솔 제목이 같은 세션이 둘 이상이면(예: 둘 다 `✳ Claude Code`) 먼저 찾은 탭으로 갑니다. hook을 설치하면 `[cc:...]` 표식으로 구분합니다. |
| 창이 앞으로 안 오고 작업표시줄만 깜빡임 | Windows의 포커스 가로채기 방지 때문입니다. 스크립트가 여러 방법을 차례로 시도하고, 그래도 안 되면 종료 코드 2로 끝나 키에 ⚠가 표시됩니다. |
| Claude Here가 엉뚱한 폴더(홈)에서 열림 | 누르는 순간 탐색기 창이 포커스돼 있지 않았거나 가상 폴더(빠른 액세스, 내 PC)였습니다. 로그의 `claude started: folder=... source=...`에서 `source`가 `focused` / `cursor` / `default` / `home` 중 무엇인지 확인하고, 탐색기 창을 한 번 클릭한 뒤 누르거나 기본 폴더를 설정하세요. |
| Claude Here에 ⚠ 표시 | 로그의 `could not start claude here` 줄에 이유가 있습니다. 대부분 마운트 실패입니다(NAS가 꺼져 있음, Google Drive 미실행). `wsl -u root -e mount -t drvfs X: /mnt/x`를 직접 실행하면 원래 오류 메시지를 볼 수 있습니다. |
| Claude Here로 열었는데 세션 키가 안 생김 | Claude가 폴더 신뢰 확인 화면에서 기다리는 중입니다. 확인을 통과하면 1초 안에 키에 나타납니다. |
| Claude App에 ⚠ 표시 | Claude 데스크톱 앱이 설치돼 있지 않거나, 실행 후 10초 안에 창이 뜨지 않았습니다. 로그의 `could not bring up the Claude app` 줄을 확인하세요. |
| 포트 충돌 | 플러그인 로그에 "already in use"가 있으면 `src/config.ts`의 포트와 hook의 `AGENT_DECK_PORT`를 같은 값으로 바꿉니다. |
| 열어 둔 적 없는 세션이 키에 뜸 | 0.2.1까지는 Claude 데스크톱 앱이 백그라운드로 유지하는 Claude Code 프로세스도 세션으로 잡혔습니다. 지금은 제외합니다. 그래도 뜨면 `http://127.0.0.1:39217/state`에서 그 세션의 `pid`를 보고, `~/.claude/sessions/<pid>.json`의 `entrypoint` 값을 확인해 `HIDDEN_ENTRYPOINTS`에 추가하세요. |
| 끝낸 세션이 키에 남아 있음 | 레지스트리로 찾은 세션은 프로세스가 사라지면 바로 지워집니다. hook만으로 알던(WSL, Codex) 세션은 12시간 동안 아무 이벤트가 없으면 자동으로 지워지고, 플러그인 재시작으로도 비울 수 있습니다. |
| 플러그인이 로드되지 않음 | Stream Deck 앱 버전(7.0 이상)과 `%ProgramFiles%\Elgato\StreamDeck\node\`에 `node20.exe`가 있는지 확인. manifest의 `Nodejs.Version`은 `"20"`입니다. `npx streamdeck restart`가 안 먹으면 Stream Deck 앱을 종료 후 다시 실행합니다. |

## 개발자 모드 없이 설치하기

`npm run link`는 Stream Deck 플러그인 폴더에 저장소를 가리키는 심볼릭 링크를 만듭니다. 개발자 모드(Windows 설정 → 시스템 → 개발자용)가 꺼져 있으면 정션으로 대신하고 Stream Deck 앱을 재시작합니다.

```powershell
New-Item -ItemType Junction -Path "$env:APPDATA\Elgato\StreamDeck\Plugins\com.hbyi.agentdeck.sdPlugin" -Target "<저장소 폴더>\com.hbyi.agentdeck.sdPlugin"
```

링크는 저장소 폴더를 직접 가리키므로 설치 후 폴더를 옮기면 안 됩니다. Stream Deck 7.0에서는 `npx streamdeck restart com.hbyi.agentdeck`가 새로 연결한 플러그인을 띄우지 않을 때가 있는데, 앱을 재시작하면 됩니다.

## 개발

```powershell
npm test          # 단위 테스트 (node:test)
npm run build     # com.hbyi.agentdeck.sdPlugin/bin/plugin.js 생성
npm run watch     # 저장할 때마다 빌드 + 플러그인 재시작 시도
npm run validate  # Stream Deck 패키지 검증
npm run pack      # 배포용 .streamDeckPlugin 파일 생성
```

```
src/
  plugin.ts            진입점: 서버 시작, 레지스트리 감시, 액션 등록
  sessions.ts          hook 이벤트 + 레지스트리 → 세션 상태 (순서 뒤바뀐 이벤트 무시, 둘의 병합 규칙)
  registry.ts          ~/.claude/sessions/*.json 읽기, PID 생존 확인, 폴링
  server.ts            127.0.0.1:39217, POST /claude, POST /codex, POST /focus·/press(디버그), GET /state
  deck.ts              키 ↔ 세션 배정, 그리기, 키 누름 처리, 500ms 애니메이션 tick
  render.ts            모든 키의 이미지(SVG)
  mascot.ts            픽셀 마스코트 장면(상태별 프레임) → SVG rect
  sysmon.ts            CPU/RAM 샘플링
  powershell.ts        scripts/*.ps1 실행 (인자 조립, 종료 코드·출력·소요 시간 수집)
  focus.ts             세션 창 찾기 호출 (Windows)
  claude-app.ts        Claude 데스크톱 앱 실행 여부 판별, 앞으로 가져오기
  claude-here.ts       Claude Here 설정 → 스크립트 인자, 실행
  actions/             Agent Session, Next Waiting, System Monitor, Claude App, Claude Here 액션
com.hbyi.agentdeck.sdPlugin/
  manifest.json
  scripts/agent-deck-win.ps1 공용: 창 찾기·포커스(C#), 콘솔 제목, 커서 아래 창, Windows Terminal 탭 선택
  scripts/focus-window.ps1   제목 표식 / 콘솔 제목 / PID 부모 체인 / 프로젝트 이름으로 창·탭 찾아서 앞으로
  scripts/claude-app.ps1     Claude 데스크톱 앱 창 포커스, 없으면 실행
  scripts/claude-here.ps1    탐색기 폴더 결정 → 필요하면 WSL 마운트 → wt/wsl로 claude 실행
  ui/session-slot.html       Agent Session 키 속성 창 (고정할 프로젝트)
  ui/claude-here.html        Claude Here 키 속성 창 (기본 폴더, 배포판, 프로필, 새 창, 셸 유지)
hooks/windows/         Windows 네이티브 Claude Code hook, Codex notify, 설치 스크립트
hooks/wsl/             WSL Claude Code hook, Codex notify, 설치 스크립트
tests/                 node:test 단위 테스트 (npm test)
tools/simulate.mjs     가짜 세션으로 키 확인
docs/                  이 상세 문서, README 사진, 설계 메모
```

### 다음에 해볼 만한 것

- **키로 권한 승인**: `PermissionRequest`를 HTTP hook으로 플러그인에 직접 보내고, 키 누름으로 allow/deny 응답을 돌려주면 됩니다. hook이 응답을 기다리는 동안 Claude가 멈춰 있으므로 타임아웃 처리가 핵심입니다.
- **Mac 지원**: `focus.ts`에 macOS 분기만 추가하면 됩니다. tmux를 쓴다면 hook에서 `$TMUX_PANE`을 함께 보내고 `tmux switch-client`로 전환하는 방식이 가장 깔끔합니다.
- **Stream Deck+ 다이얼**: 돌려서 세션 순환, 눌러서 이동.

## 마스코트에 관해

이 저장소의 마스코트는 CodeIsland의 `docs/images/mascots/claude.gif`를 보고 `src/mascot.ts`에 셀 단위로 다시 그린 것입니다. 타이핑 장면은 원본을 거의 그대로 따랐고, 자는 중·완료·대기·오류 장면은 이 프로젝트에서 추가했습니다. CodeIsland의 파일(이미지, 코드)을 복사해 넣은 것은 없지만 디자인상 2차 저작물로 볼 수 있어 MIT 라이선스 고지를 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)에 포함했습니다.

이 캐릭터(주황색 네모 몸통에 눈 둘)는 Claude Code의 주황색 픽셀 캐릭터를 연상시키는 디자인입니다. 공개 배포 전에는 Anthropic의 브랜드 사용 정책을 확인하거나 캐릭터를 독자 디자인으로 바꾸는 것을 권합니다.
