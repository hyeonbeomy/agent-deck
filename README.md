# Agent Deck

**English** | [한국어](README.ko.md)

A Stream Deck plugin for Windows that shows one Claude Code (or Codex) session per key.
A pixel mascot on each key acts out what the session is doing (working, waiting for approval, done, sleeping, error), and pressing the key jumps straight to the terminal window the session runs in, down to the right Windows Terminal tab. It also comes with a CPU / RAM key, a key that brings the Claude desktop app to the front, and a key that starts Claude in the Explorer folder you are looking at.

<p align="center">
  <img src="docs/images/agent-deck.jpg" alt="Agent Deck on a Stream Deck: the CPU/RAM key, a sleeping session and a working session" width="720">
</p>

> The idea and the mascot design come from [CodeIsland](https://github.com/wxtsky/CodeIsland) (wxtsky, MIT), which shows AI coding agent status in the macOS notch. The code here was written from scratch for Windows and Stream Deck, and the mascot was redrawn in code after CodeIsland's Claude mascot. See [Credits and copyright](#credits-and-copyright) at the bottom.

## The five keys

### Agent Session

One key per session. Put as many on the deck as you like.

| Key colour | Mascot | Text below | Meaning |
| --- | --- | --- | --- |
| Blue | Typing at a keyboard | `WORKING 1:23` / `1:23 · Bash` | Working (elapsed time, name of the running tool) |
| Amber (pulsing) | Waving one arm, `!` bubble | `APPROVE?` / `NEEDS YOU` | Waiting for a permission approval / for input |
| Amber (pulsing) | `?` bubble | `QUESTION` | Claude is asking a question |
| Green | Both arms up, check mark | `DONE` | Turn finished, your move |
| Dark grey | Eyes closed, `zzz` | `Zzz` | Asleep (already seen / session only just started / finished more than 15 minutes ago and left alone) |
| Red | X eyes, shaking | `ERROR` | The turn stopped on an API error |

The name on the key is the folder Claude was started in. **Pressing** the key brings that session's terminal to the front and marks the session as seen (a finished session then falls asleep).

### Next Waiting

A summary key that counts the sessions waiting for you. One is enough.

- With nothing waiting it shows `0` **ALL CLEAR**. Otherwise it shows the count, **WAITING**, and the name of the most urgent session. It pulses amber when an approval or question is pending and is green when only unseen finished turns are left.
- Urgency order: approval / question / input, then errors, then finished turns you have not looked at. Within a group the oldest comes first.
- **Pressing** it jumps to the most urgent session and marks it as seen, so pressing repeatedly walks through the sessions in order. Most useful when you have more sessions than keys.

### System Monitor

CPU load (bar plus a graph of the last 36 seconds) and RAM use (bar plus used / total GB), refreshed every second. Green below 50%, amber below 80%, red above. **Pressing** it opens Task Manager.

### Claude App

Brings the Claude desktop app to the front. If the app is not running, or is hidden in the tray, it is started first and the key waits for its window.

- The key shows whether the app is running: a green dot and `RUNNING`, or a grey dot and `OFF` (checked every 5 seconds while the key is visible).
- Both the Microsoft Store version and the installer version (`%LOCALAPPDATA%\AnthropicClaude`) are found. The Claude Code CLI is also called `claude.exe`; the two are told apart by install path and by whether the process owns a window.
- A ✓ flashes on the key on success, a ⚠ when the app is not installed or no window appears within 10 seconds.

### Claude Here

Starts Claude Code in the folder you are looking at. **Pressing** it opens a new Windows Terminal tab in which WSL changes to that folder and runs `claude`.

- **Which folder**: ① the current folder of the focused File Explorer window (or the sub-folder, if exactly one is selected) ② the Explorer window under the mouse cursor ③ the Desktop folder when the desktop is focused ④ the default folder from the key's settings ⑤ your home folder. Virtual locations such as Quick access or This PC are skipped. Pressing a Stream Deck key does not move the focus, so click the Explorer window, then press the key.
- **Automatic mounting**: WSL only mounts fixed local drives on its own. For locations WSL cannot translate (a NAS share, a mapped network drive, Google Drive's virtual drive) the drive or share is mounted first. A drive `X:\...` goes to `/mnt/x` and a share `\\server\share\...` to `/mnt/server-share`, with `drvfs`, run through `wsl -u root` so no password is asked. The mount lasts until WSL shuts down.
- **Settings** (key property inspector, labels are in Korean): default folder (기본 폴더), WSL distribution (WSL 배포판, empty = default distribution), terminal profile for the tab's looks (터미널 프로필), open a new window instead of a tab (새 창), keep the shell open after claude exits (셸 유지).
- The new session shows up on an Agent Session key once Claude is past its "trust this folder?" prompt. Claude Code does not record the session before that.
- Without Windows Terminal, `wsl.exe` is started in a plain console window.

## Requirements

- Windows 10/11
- Stream Deck app 7.0 or later (it ships the Node 20 runtime the plugin runs on)
- Claude Code **for Windows**, 2.1.119 or later. If you installed it with npm you already have Node.js.
- Only for building from source: Node.js 20 or later, git
- Only for Codex: the Codex CLI (needs a `notify` line, see below)
- Only for the Claude Here key: a WSL distribution and Windows Terminal. `claude` must run in the WSL shell (the Windows claude on the PATH is enough).
- Only for the Claude App key: the Claude desktop app

It does not matter which shell you start Claude from. cmd, PowerShell, Windows Terminal, and a WSL shell that calls the Windows `claude` through interop all work without any hook. The one exception is a Linux claude installed **inside** WSL, which needs the WSL hook described below.

## Install

### A. From a package file (no Node.js needed)

If you were given `com.hbyi.agentdeck.streamDeckPlugin`, double-click it. The Stream Deck app asks whether to install it and loads it right away. The file is made with `npm run pack` on a PC that has the source.

### B. From source (PowerShell)

```powershell
git clone https://github.com/hyeonbeomy/agent-deck.git
cd agent-deck
npm install
npm run build
npm test
npm run link
```

Then **quit the Stream Deck app completely and start it again**. (On 7.0, `npx streamdeck restart com.hbyi.agentdeck` does not always load a freshly linked plugin.)

- `npm run link` creates a symbolic link to this repository in the Stream Deck plugin folder. It can fail when **Developer Mode** (Windows Settings → System → For developers) is off; use a junction instead:
  ```powershell
  New-Item -ItemType Junction -Path "$env:APPDATA\Elgato\StreamDeck\Plugins\com.hbyi.agentdeck.sdPlugin" -Target "<repo folder>\com.hbyi.agentdeck.sdPlugin"
  ```
- The link points at the repository folder, so do not move the folder afterwards. If you have to, build a package with `npm run pack` and install that.
- After changing code, run `npm run build` and restart the Stream Deck app.

### C. Put the keys on the deck

The Stream Deck app's action list gets an **Agent Deck** category. Drag **Agent Session** onto as many keys as you want, and **Next Waiting**, **System Monitor**, **Claude App** and **Claude Here** onto one key each if you want them.

That is all it takes: Claude Code sessions started on Windows appear on the keys, show working / done / asleep, and pressing a key jumps to the window.

## Usage

### Which key shows which session

- Keys that are not pinned fill up **from the top left, left to right, then down**, in the order the sessions were started. When a session ends (process exit or `SessionEnd`) its key empties and the later sessions move up.
- **Pinning**: select a key and type a project folder name into the **고정할 프로젝트** (pinned project) field of the property inspector. That key then only shows sessions of that project. A partial name is enough.
- To change the name on the key (with the hook installed), set the environment variable `AGENT_DECK_LABEL=name` before starting the session.

### Jumping to the window

Pressing a key looks for the window in this order:

1. A window or Windows Terminal tab whose title carries the `[cc:xxxxxxxx]` token the hook writes (with the hook installed; the most exact).
2. The title of the console the session's process is attached to. Claude Code sets it to something like `◐ conversation summary`, so the terminal window or Windows Terminal tab with the same title is found and that tab is selected. This also works for terminals started from Explorer or the Start menu, and for a Windows Terminal with several windows.
3. The first program in the session's parent process chain that owns a window (Windows Terminal, conhost, VS Code, ...). This finds the window but cannot pick a tab.
4. A terminal window with the project name in its title (best effort, for Codex).

When no window is found, or Windows refuses the switch, a ⚠ flashes on the key.

### Optional: install the Claude Code hook

Everything basic works without a hook. Installing it adds:

- telling approval requests (`APPROVE?`) from questions (`QUESTION`), the name of the running tool, and API errors (`ERROR`)
- a `[cc:xxxxxxxx]` token in the terminal title, so the right tab is found even when several sessions have the same console title (for example two sessions both titled `✳ Claude Code`)

**Windows (PowerShell)**

```powershell
node hooks\windows\install.mjs
```

- Copies the scripts to `%USERPROFILE%\.claude\agent-deck\` and adds the hooks to `%USERPROFILE%\.claude\settings.json`. Hooks of other tools and your other settings are left alone, and a backup is written before anything changes. Running it again does not create duplicates.
- The hooks are registered in exec form (`node.exe` run directly, no shell), so they work with or without Git Bash.
- It also sets `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`, because the token disappears when Claude Code overwrites the terminal title with its own. Pass `--keep-title` to keep Claude's titles (tabs are then found by console title).
- Sessions that are already running need a restart to pick up the hook.
- Remove: `node hooks\windows\install.mjs --uninstall`

**WSL (when you run a Linux claude inside WSL)**

```bash
cd /mnt/c/<path to the repo>/hooks/wsl
bash install.sh
```

- Copies the scripts to `~/.claude/agent-deck/` and adds the hooks to `~/.claude/settings.json`. Existing settings are kept and a backup is written.
- At the end it checks the connection to the plugin and tells you the result. If it prints `transport: win`, add `export AGENT_DECK_TRANSPORT=win` to `~/.bashrc` to skip one probing step every time.
- With WSL2's default (NAT) networking, WSL cannot reach `127.0.0.1` on Windows, so the hook calls the Windows `curl.exe` through interop. With mirrored networking it posts with WSL's own curl. Both are tried automatically.
- Remove: `bash install.sh --uninstall`

### Codex

Codex only notifies when a turn ends (`notify`), so the key is only accurate for **DONE** and never shows "working". Its mascot is drawn in light purple. Pressing the key looks for a terminal window with the project name in its title.

- Windows native: `%USERPROFILE%\.codex\config.toml` (`node hooks\windows\install.mjs` prints the exact line for you)
  ```toml
  notify = ["C:/Program Files/nodejs/node.exe", "C:/Users/<user>/.claude/agent-deck/codex-notify.mjs"]
  ```
- WSL: `~/.codex/config.toml`
  ```toml
  notify = ["/home/<user>/.claude/agent-deck/codex-notify.sh"]
  ```

Codex accepts only one `notify` line, so replace an existing one.

## Checking and debugging

```powershell
npm run simulate          # a fake session goes working -> waiting for approval -> done (check the keys without Claude)
npm run simulate -- end   # remove the fake session
```

- `http://127.0.0.1:39217/state`: the sessions the plugin knows, as JSON. A session with a `pid` was found through the session registry.
- Reproduce a jump: `curl -X POST http://127.0.0.1:39217/focus -d "{\"pid\":1234}"` (or `{"key":"claude:..."}`, `{"label":"project"}`). It takes the same path as a key press and returns `ok`, the script's exit code `code` (0 focused, 1 not found, 2 switch refused) and the duration `ms`.
- Reproduce Claude App / Claude Here: `curl -X POST http://127.0.0.1:39217/press -d "{\"action\":\"claudeapp\"}"`, `curl -X POST http://127.0.0.1:39217/press -d "{\"action\":\"claudehere\",\"settings\":{\"defaultFolder\":\"C:/work\"}}"`. They run the same code as the keys and return the result. For Claude Here, `detail` holds the chosen folder, why it was chosen (`source`), the WSL path, and whether something was mounted.
- To try a script by hand, add `-DryRun`: nothing is started and only the chosen folder and the command are printed: `powershell -File com.hbyi.agentdeck.sdPlugin\scripts\claude-here.ps1 -DryRun`
- POSTs sent by a web page (requests with an `Origin` header) are refused with 403. Hooks and curl are not affected.
- Plugin log: `com.hbyi.agentdeck.sdPlugin/logs/`. Jumps are logged as `focused ...` / `could not focus ...`, Claude Here as `claude started: folder=...`.

## How it works

There are two ways the plugin learns about sessions, and both feed the same session store.

```
[Windows] claude.exe ──┬─ ~/.claude/sessions/<pid>.json ──(polled every 1 s)──> Stream Deck plugin (Node)
                       │    pid, cwd, status(busy/idle/waiting)                 127.0.0.1:39217
                       └─ hook ──> agent-deck-hook.mjs ──POST──>                      │
                            └─ sets the terminal title to "project [cc:session]"      ├─ draws the keys (mascot)
                                                                                      │
[WSL] claude ──hook──> agent-deck-hook.sh ──curl.exe(interop)──>                      │
                                                                                      │
                       key press → focus-window.ps1 → window/tab titled [cc:session] → window/tab with the pid's console title → window in the pid's parent chain
```

- **Session registry (works without a hook)**: Claude Code 2.1.119 and later writes every running session to `~/.claude/sessions/<pid>.json` (`status`: `busy` / `idle` / `waiting`). The plugin reads that folder once a second and ignores entries whose process is gone. Only sessions started in a terminal (`entrypoint: cli`) get a key. The Claude Code processes the Claude desktop app runs internally (`entrypoint: claude-desktop`) stay alive in the background after you close the session on screen, so they are left out. Change `HIDDEN_ENTRYPOINTS` in `src/config.ts` to adjust this.
- **Hook**: adds tool names, the approval / question distinction and the error state, and writes the token into the terminal title. When a hook event is newer than the registry entry, the hook's state wins.
- The mascot uses no image files: `src/mascot.ts` composes it cell by cell and emits SVG. A key image is only sent to the device when it changes.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Keys never change | Check the plugin first with `npm run simulate`. If that works, see whether `http://127.0.0.1:39217/state` lists your session. If not, check that `~/.claude/sessions/*.json` files appear (Claude Code 2.1.119 or later, Windows version). For a Linux claude in WSL, run `bash install.sh` again and read its connection check. |
| Keys update but pressing does not bring the window (⚠ on the key) | Look for `could not focus ... exit N` in the plugin log. 1 = no window found, 2 = found but Windows refused the switch. `POST /focus` reproduces it. With the hook installed, check that the window title shows `[cc:...]`, that `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` is set, and that the session was restarted. Without the hook, check that the `pid` in `/state` is a real claude process. |
| Pressing does nothing and there is no ⚠ | Up to 0.2.0, a terminal started from Explorer had a parent chain that ended at explorer.exe, so the desktop was "focused" and reported as success. Since 0.2.1 the console title is used and shell processes are skipped. Make sure the plugin was restarted with the new build. |
| The window comes up but shows another tab | When two or more sessions have the same console title (for example both `✳ Claude Code`), the first tab found wins. Install the hook to tell them apart by the `[cc:...]` token. |
| The window does not come forward, the taskbar button only flashes | Windows' focus-stealing prevention. The script tries several methods in turn; if all fail it exits with code 2 and the key shows ⚠. |
| Claude Here opens in the wrong folder (home) | No Explorer window was focused when you pressed the key, or it showed a virtual folder (Quick access, This PC). In the log line `claude started: folder=... source=...`, `source` is one of `focused` / `cursor` / `default` / `home`. Click the Explorer window once before pressing, or set a default folder. |
| ⚠ on Claude Here | The log line `could not start claude here` gives the reason, usually a failed mount (NAS switched off, Google Drive not running). Run `wsl -u root -e mount -t drvfs X: /mnt/x` yourself to see the original error. |
| Opened with Claude Here but no session key appears | Claude is waiting at its "trust this folder?" prompt. The key appears within a second after you answer it. |
| ⚠ on Claude App | The Claude desktop app is not installed, or no window appeared within 10 seconds of starting it. See `could not bring up the Claude app` in the log. |
| Port conflict | If the plugin log says "already in use", change the port in `src/config.ts` and set the hooks' `AGENT_DECK_PORT` to the same value. |
| A session you never opened shows on a key | Up to 0.2.1, the Claude Code processes the Claude desktop app keeps in the background were picked up as sessions. They are now left out. If one still shows, look up its `pid` at `http://127.0.0.1:39217/state`, read the `entrypoint` value in `~/.claude/sessions/<pid>.json`, and add it to `HIDDEN_ENTRYPOINTS`. |
| A finished session stays on its key | Sessions found through the registry are removed as soon as their process is gone. Sessions known only through a hook (WSL, Codex) are dropped after 12 hours without events, and restarting the plugin clears them too. |
| The plugin does not load | Check the Stream Deck app version (7.0 or later) and that `%ProgramFiles%\Elgato\StreamDeck\node\` contains `node20.exe`. The manifest's `Nodejs.Version` is `"20"`. If `npx streamdeck restart` has no effect, quit the Stream Deck app and start it again. |

## Development

```powershell
npm test          # unit tests (node:test)
npm run build     # writes com.hbyi.agentdeck.sdPlugin/bin/plugin.js
npm run watch     # rebuild on save and try to restart the plugin
npm run validate  # validate the Stream Deck package
npm run pack      # build the .streamDeckPlugin file for distribution
```

```
src/
  plugin.ts            entry point: starts the server and the registry watcher, registers the actions
  sessions.ts          hook events + registry -> session state (drops out-of-order events, merge rules)
  registry.ts          reads ~/.claude/sessions/*.json, checks that the pid is alive, polls
  server.ts            127.0.0.1:39217, POST /claude, POST /codex, POST /focus and /press (debug), GET /state
  deck.ts              key <-> session assignment, drawing, key presses, 500 ms animation tick
  render.ts            key images (SVG) for every key
  mascot.ts            pixel mascot scenes (frames per state) -> SVG rects
  sysmon.ts            CPU / RAM sampling
  powershell.ts        runs scripts/*.ps1 (arguments, exit code, output, duration)
  focus.ts             finds a session's window (Windows)
  claude-app.ts        detects whether the Claude desktop app runs, brings it to the front
  claude-here.ts       Claude Here settings -> script arguments, launch
  actions/             Agent Session, Next Waiting, System Monitor, Claude App, Claude Here
com.hbyi.agentdeck.sdPlugin/
  manifest.json
  scripts/agent-deck-win.ps1 shared: window lookup and focus (C#), console title, window under the cursor, Windows Terminal tab selection
  scripts/focus-window.ps1   finds the window/tab by title token, console title, parent chain or project name and brings it forward
  scripts/claude-app.ps1     focuses the Claude desktop app window, starts the app if needed
  scripts/claude-here.ps1    picks the Explorer folder -> mounts it in WSL if needed -> starts claude with wt/wsl
  ui/session-slot.html       property inspector of the Agent Session key (pinned project)
  ui/claude-here.html        property inspector of the Claude Here key (default folder, distribution, profile, new window, keep shell)
hooks/windows/         native Windows Claude Code hook, Codex notify, installer
hooks/wsl/             WSL Claude Code hook, Codex notify, installer
tests/                 node:test unit tests (npm test)
tools/simulate.mjs     fake sessions for checking the keys
docs/images/           the photo used in this README
```

### Ideas for later

- **Approve permissions from a key**: send `PermissionRequest` to the plugin as an HTTP hook and answer allow / deny with a key press. Claude is blocked while the hook waits, so the timeout handling is the hard part.
- **macOS**: add a macOS branch to `focus.ts`. With tmux, the cleanest way is to send `$TMUX_PANE` from the hook and switch with `tmux switch-client`.
- **Stream Deck+ dials**: turn to cycle through sessions, press to jump.

## Credits and copyright

- **[CodeIsland](https://github.com/wxtsky/CodeIsland)** (Copyright (c) 2026 wxtsky, MIT License): the idea of showing an agent's state with a pixel mascot that acts out what the agent is doing, the set of states, and the **mascot design** come from this project. The mascot in this repository was redrawn cell by cell in `src/mascot.ts` after CodeIsland's `docs/images/mascots/claude.gif`. The typing scene follows the original closely; the sleeping, done, waiting and error scenes were added here. No file from CodeIsland (image or code) was copied into this repository, but the design can be seen as a derivative work, so the MIT license notice is included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). CodeIsland is a Swift app for macOS; the code of this plugin was written from scratch in TypeScript.
- The mascot (an orange box with two eyes) is a design reminiscent of Claude Code's own orange pixel character. Claude and Claude Code are trademarks of Anthropic, Codex of OpenAI, and Stream Deck of Elgato. This is an unofficial personal project with no relation to those companies. Before distributing it publicly, check Anthropic's brand guidelines or replace the character with a design of your own.
