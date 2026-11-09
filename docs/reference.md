# Agent Deck reference

**English** | [한국어](reference.ko.md) · back to the [README](../README.md)

Details that did not fit the README: what each key does exactly, how windows are found, hooks, Codex, debugging, how the plugin works, troubleshooting and the source layout.

## Keys in detail

### Agent Session

- The name on the key is the folder Claude was started in. With the hook installed, set `AGENT_DECK_LABEL=name` before starting a session to change it.
- The working state shows the elapsed time, and with the hook also the running tool: `1:23 · Bash`.
- A finished turn shows `DONE` until you press the key (the session is then marked as seen and falls asleep) or until 15 minutes pass.
- Keys that are not pinned fill up from the top left, left to right, then down, in the order the sessions were started. When a session ends its key empties and the later sessions move up.
- Pinning: the **고정할 프로젝트** (pinned project) field of the property inspector takes a project folder name; a partial name is enough.

### Next Waiting

- Nothing waiting: `0` **ALL CLEAR**. Otherwise the count, **WAITING**, and the name of the most urgent session. It pulses amber while an approval or question is pending and is green when only unseen finished turns are left.
- Order: approval / question / input, then errors, then unseen finished turns. Within a group the oldest comes first.
- Pressing it marks that session as seen, so pressing repeatedly walks through the sessions.

### System Monitor

CPU load (bar plus a graph of the last 36 seconds) and RAM use (bar plus used / total GB), refreshed every second. Green below 50%, amber below 80%, red above.

### Claude App

- The running / off dot is checked every 5 seconds while the key is visible.
- Both the Microsoft Store version and the installer version (`%LOCALAPPDATA%\AnthropicClaude`) are found. The Claude Code CLI is also called `claude.exe`; the two are told apart by install path and by whether the process owns a window.
- If the app is not running or is hidden in the tray, it is started and the key waits up to 10 seconds for its window.

### Claude Here

- **Folder**: ① the current folder of the focused File Explorer window, or the sub-folder if exactly one is selected ② the Explorer window under the mouse cursor ③ the Desktop folder when the desktop is focused ④ the default folder from the key's settings ⑤ your home folder. Virtual locations such as Quick access or This PC are skipped. Windows 11 Explorer tabs are told apart through UI Automation.
- **Automatic mounting**: WSL only mounts fixed local drives on its own. When WSL cannot translate the folder (`wslpath` fails), the drive or share is mounted first with `drvfs`, through `wsl -u root`, so no password is asked. A drive `X:\...` goes to `/mnt/x`, a share `\\server\share\...` to `/mnt/server-share`. The mount lasts until WSL shuts down.
- **Command**: `wt.exe -w new new-tab --title "claude: <folder>" wsl.exe --cd <linux path> -- bash -lic claude`, a new Windows Terminal window with your default profile's looks. Without Windows Terminal, `wsl.exe` is started in a plain console window.
- **Environment**: the terminal is started with a fresh logon environment (the machine and user variables from the registry), not with the plugin's own. Otherwise whatever started Stream Deck would leak into every new terminal.
- **Settings** (labels are in Korean): default folder (기본 폴더), WSL distribution (WSL 배포판, empty = default), terminal profile for the window's looks (터미널 프로필), open a tab in the last used window instead of a new window (탭으로 열기), keep the shell open after claude exits (셸 유지).
- The new session appears on an Agent Session key within a second or two, also while Claude is still showing its "trust this folder?" prompt.

## How the window is found

Pressing a session key looks for the window in this order:

1. A window or Windows Terminal tab whose title carries the `[cc:xxxxxxxx]` token the hook writes (with the hook installed; the most exact).
2. The title of the console the session's process is attached to. Claude Code sets it to something like `◐ conversation summary`, so the terminal window or Windows Terminal tab with the same title is found and that tab is selected. This also works for terminals started from Explorer or the Start menu, and for a Windows Terminal with several windows.
3. The first program in the session's parent process chain that owns a window (Windows Terminal, conhost, VS Code, ...). Shell and system processes such as explorer.exe are skipped. This finds the window but cannot pick a tab.
4. A terminal window with the project name in its title (best effort, for Codex).

When no window is found, or Windows refuses the switch, a ⚠ flashes on the key.

## Hooks

Everything basic works without a hook. The hook adds the approval / question distinction, tool names, the error state, and a `[cc:xxxxxxxx]` token in the terminal title that tells sessions with identical titles apart.

**Windows (PowerShell)**

```powershell
node hooks\windows\install.mjs
```

- Copies the scripts to `%USERPROFILE%\.claude\agent-deck\` and adds the hooks to `%USERPROFILE%\.claude\settings.json`. Hooks of other tools and your other settings are left alone, and a backup is written first. Running it again does not create duplicates.
- The hooks are registered in exec form (`node.exe` run directly, no shell), so they work with or without Git Bash.
- It also sets `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`, because the token disappears when Claude Code overwrites the terminal title. Pass `--keep-title` to keep Claude's titles (tabs are then found by console title).
- Running sessions need a restart to pick up the hook.
- Remove: `node hooks\windows\install.mjs --uninstall`

**WSL (a Linux claude installed inside WSL)**

```bash
cd /mnt/c/<path to the repo>/hooks/wsl
bash install.sh
```

- Copies the scripts to `~/.claude/agent-deck/` and adds the hooks to `~/.claude/settings.json`, keeping existing settings and writing a backup.
- At the end it checks the connection to the plugin. If it prints `transport: win`, add `export AGENT_DECK_TRANSPORT=win` to `~/.bashrc` to skip one probing step every time.
- With WSL2's default (NAT) networking, WSL cannot reach `127.0.0.1` on Windows, so the hook calls the Windows `curl.exe` through interop. With mirrored networking it posts with WSL's own curl. Both are tried automatically.
- Remove: `bash install.sh --uninstall`

## Codex

Codex only notifies when a turn ends (`notify`), so the key is only accurate for **DONE** and never shows "working". Its mascot is drawn in light purple. Pressing the key looks for a terminal window with the project name in its title.

- Windows native: `%USERPROFILE%\.codex\config.toml` (`node hooks\windows\install.mjs` prints the exact line)
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
npm run simulate          # a fake session goes working -> waiting for approval -> done
npm run simulate -- end   # remove the fake session
```

- `http://127.0.0.1:39217/state`: the sessions the plugin knows, as JSON. A session with a `pid` was found through the session registry.
- Reproduce a jump: `curl -X POST http://127.0.0.1:39217/focus -d "{\"pid\":1234}"` (or `{"key":"claude:..."}`, `{"label":"project"}`). It takes the same path as a key press and returns `ok`, the script's exit code `code` (0 focused, 1 not found, 2 switch refused) and the duration `ms`.
- Reproduce Claude App / Claude Here: `curl -X POST http://127.0.0.1:39217/press -d "{\"action\":\"claudeapp\"}"`, `curl -X POST http://127.0.0.1:39217/press -d "{\"action\":\"claudehere\",\"settings\":{\"defaultFolder\":\"C:/work\"}}"`. For Claude Here, `detail` holds the chosen folder, why it was chosen (`source`), the WSL path, and whether something was mounted.
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
| Opened with Claude Here but no session key appears, or the new terminal has no colours | Up to 0.3.0 the new terminal inherited the plugin's environment. If Stream Deck itself had been started from a shell inside a Claude Code session, the new claude ran as that session's child (so it never registered and got no key) and with `NO_COLOR` set. Since 0.3.1 the terminal gets a fresh logon environment. If it still happens, quit Stream Deck and start it from the Start menu. |
| ⚠ on Claude App | The Claude desktop app is not installed, or no window appeared within 10 seconds of starting it. See `could not bring up the Claude app` in the log. |
| Port conflict | If the plugin log says "already in use", change the port in `src/config.ts` and set the hooks' `AGENT_DECK_PORT` to the same value. |
| A session you never opened shows on a key | Up to 0.2.1, the Claude Code processes the Claude desktop app keeps in the background were picked up as sessions. They are now left out. If one still shows, look up its `pid` at `http://127.0.0.1:39217/state`, read the `entrypoint` value in `~/.claude/sessions/<pid>.json`, and add it to `HIDDEN_ENTRYPOINTS`. |
| A finished session stays on its key | Sessions found through the registry are removed as soon as their process is gone. Sessions known only through a hook (WSL, Codex) are dropped after 12 hours without events, and restarting the plugin clears them too. |
| The plugin does not load | Check the Stream Deck app version (7.0 or later) and that `%ProgramFiles%\Elgato\StreamDeck\node\` contains `node20.exe`. The manifest's `Nodejs.Version` is `"20"`. If `npx streamdeck restart` has no effect, quit the Stream Deck app and start it again. |

## Installing without Developer Mode

`npm run link` creates a symbolic link to the repository in the Stream Deck plugin folder. When Developer Mode (Windows Settings → System → For developers) is off, use a junction instead and restart the Stream Deck app:

```powershell
New-Item -ItemType Junction -Path "$env:APPDATA\Elgato\StreamDeck\Plugins\com.hbyi.agentdeck.sdPlugin" -Target "<repo folder>\com.hbyi.agentdeck.sdPlugin"
```

The link points at the repository folder, so do not move the folder afterwards. On Stream Deck 7.0, `npx streamdeck restart com.hbyi.agentdeck` does not always load a freshly linked plugin; restarting the app does.

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
  ui/claude-here.html        property inspector of the Claude Here key (default folder, distribution, profile, open as tab, keep shell)
hooks/windows/         native Windows Claude Code hook, Codex notify, installer
hooks/wsl/             WSL Claude Code hook, Codex notify, installer
tests/                 node:test unit tests (npm test)
tools/simulate.mjs     fake sessions for checking the keys
docs/                  this reference, the README photo, design notes
```

### Ideas for later

- **Approve permissions from a key**: send `PermissionRequest` to the plugin as an HTTP hook and answer allow / deny with a key press. Claude is blocked while the hook waits, so the timeout handling is the hard part.
- **macOS**: add a macOS branch to `focus.ts`. With tmux, the cleanest way is to send `$TMUX_PANE` from the hook and switch with `tmux switch-client`.
- **Stream Deck+ dials**: turn to cycle through sessions, press to jump.
