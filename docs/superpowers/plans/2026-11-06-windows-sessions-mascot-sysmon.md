# Windows 세션 감지 · Claude 마스코트 · CPU/RAM 키 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows 네이티브 Claude Code 세션을 Stream Deck 키에 자동으로 띄우고, 상태별로 움직이는 Claude 픽셀 마스코트를 그리고, 키로 세션 창에 가며, CPU/RAM 키를 추가한다.

**Architecture:** 세션 상태의 단일 소스는 기존 `SessionStore`다. 거기에 (1) `~/.claude/sessions/*.json` 레지스트리 폴링과 (2) Windows 네이티브 hook 두 입력을 더한다. 키 그리기는 `render.ts`가 `mascot.ts`(픽셀 캔버스 → SVG rect)를 호출해 상태별 장면을 합성한다. CPU/RAM은 세션과 무관한 별도 액션이다.

**Tech Stack:** TypeScript, @elgato/streamdeck 3.x (Node 20 런타임), rollup, node:test + tsx, PowerShell(창 포커스), Node 스크립트(hook/installer), PIL(아이콘 생성 1회).

## Global Constraints

- manifest `Nodejs.Version` = `"20"`, `Software.MinimumVersion` = `"7.0"` (이 PC: Stream Deck 7.0.3, node20.exe만 존재).
- 세션 키는 `claude:<session_id>` / `codex:<id>` 유지. 메시지 포맷(hook payload + `deck` 메타)은 WSL hook과 동일.
- 기존 `~/.claude/settings.json`의 다른 hook(Notchcode 등)은 건드리지 않는다. Agent Deck 항목은 멱등 교체.
- 키 이미지는 SVG data URI. 같은 문자열이면 `setImage` 생략(기존 캐시).
- 테스트 러너: `node --import tsx --test "tests/**/*.test.ts"`.

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `src/config.ts` (수정) | TICK_MS 500, DONE_TO_SLEEP_MS, REGISTRY_POLL_MS, LABELS 갱신 |
| `src/sessions.ts` (수정) | `Session.pid`, `registryStatus`; `syncRegistry(entries)`; `autoSleep(now)` |
| `src/registry.ts` (신규) | 레지스트리 파일 파싱(`parseRegistryFile`), PID 생존 확인, `RegistryWatcher` 폴링 |
| `src/mascot.ts` (신규) | `PixelCanvas`, 장면 합성 `mascotSvg(state, frame, opts)` |
| `src/render.ts` (수정) | 슬롯 레이아웃(라벨/마스코트/상태줄), `renderSysMonitor` |
| `src/sysmon.ts` (신규) | `cpuPercent(prev, next)`, `SystemSampler`, 포맷 헬퍼 |
| `src/actions/sys-monitor.ts` (신규) | 액션 `com.hbyi.agentdeck.sysmon`: 1초 샘플, 그리기, 누르면 작업 관리자 |
| `src/deck.ts` (수정) | 500ms tick, 프레임 카운터, 세션 있으면 렌더, pid 포커스 |
| `src/focus.ts` (수정) | `-ProcessId` 전달 |
| `src/plugin.ts` (수정) | RegistryWatcher 시작, sysmon 액션 등록 |
| `scripts/focus-window.ps1` (수정) | `-ProcessId`: 부모 체인에서 창 가진 프로세스 찾기 |
| `hooks/windows/agent-deck-hook.mjs` (신규) | Windows 네이티브 Claude hook |
| `hooks/windows/settings-merge.mjs` (신규) | settings.json 병합 순수 함수 |
| `hooks/windows/install.mjs` (신규) | 복사 + 병합 + 백업 + 연결 확인 |
| `tests/*.test.ts`, `tests/settings-merge.test.ts` | 단위 테스트 |
| `manifest.json`, `imgs/actions/sysmon/*` | 액션 등록, 아이콘 |
| `README.md` | Windows 설치, 마스코트 표, CPU/RAM 키 |

## Tasks

### Task 1: 빌드 기준선 (manifest 런타임, 테스트 러너)
- [x] manifest `Nodejs.Version` "20", `Software.MinimumVersion` "7.0"
- [x] `package.json`: devDependency `tsx`, script `test`
- [x] `npm run build` 성공, `npx streamdeck validate` 성공

### Task 2: 레지스트리 감시
- [x] `tests/registry.test.ts`: `parseRegistryFile` (정상/`.key` 무시/kind 필터/필수 필드 누락), `mapRegistryStatus`
- [x] `tests/sessions.test.ts`: `syncRegistry` — busy→working, waiting→attention(input), idle after working→done, 같은 status 반복 시 seen 유지, hook ts가 더 새로우면 무시, 레지스트리에서 사라지면 제거, hook 전용 세션은 유지; `autoSleep`
- [x] 구현 `src/registry.ts`, `src/sessions.ts`
- [x] 테스트 통과

### Task 3: 마스코트
- [x] `tests/mascot.test.ts`: 모든 (state, kind, frame) 조합이 비어 있지 않은 SVG를 내고 캔버스 범위 안에 있음; 프레임 간 차이가 있음; working 프레임 수 3
- [x] 구현 `src/mascot.ts`; `render.ts` 레이아웃 교체; `deck.ts` tick/frame
- [x] 테스트 통과, `npm run build`

### Task 4: PID 포커스
- [x] `focus-window.ps1` `-ProcessId` 분기 (CIM 부모 체인 → 창 소유 프로세스 → Focus)
- [x] `focus.ts`: token → pid → label 순서로 인자 전달
- [x] 수동 확인: 현재 세션 PID로 스크립트 실행 시 Windows Terminal 창이 앞으로 옴

### Task 5: CPU/RAM 키
- [x] `tests/sysmon.test.ts`: `cpuPercent` (idle 100% → 0, busy → 100, 0 delta → 0), `ramPercent`, `formatGb`
- [x] 구현 `src/sysmon.ts`, `renderSysMonitor`, `src/actions/sys-monitor.ts`, manifest 액션, 아이콘 PNG
- [x] 테스트 통과, validate 성공

### Task 6: Windows hook + 설치 스크립트
- [x] `tests/settings-merge.test.ts`: 설치 시 hook 추가(exec form, sync/async 분리), 기존 다른 hook 보존, 재설치 시 중복 없음, uninstall 시 Agent Deck 항목과 env만 제거, keep-title
- [x] 구현 `settings-merge.mjs`, `agent-deck-hook.mjs`, `install.mjs`
- [x] 수동 확인: `echo '{...SessionStart...}' | node agent-deck-hook.mjs` 가 terminalSequence JSON을 출력하고 `/state`에 세션이 생김

### Task 7: 배선, README, 설치
- [x] `plugin.ts`에 watcher/sysmon 등록; `tools/simulate.mjs` 그대로 동작
- [x] README 갱신
- [x] `npm run build` → `npx streamdeck link` → Stream Deck 앱 재시작 → `/state`에 실제 세션 표시 확인
- [ ] `node hooks/windows/install.mjs` (사용자 settings.json 수정이라 자동 실행이 거부됨 → 사용자가 직접 실행)
