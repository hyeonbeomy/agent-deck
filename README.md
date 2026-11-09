# Agent Deck

**English** | [한국어](README.ko.md)

A Stream Deck plugin for Windows that shows one Claude Code (or Codex) session per key. A pixel mascot acts out what the session is doing, and pressing the key jumps to the session's terminal, down to the right Windows Terminal tab.

<p align="center">
  <img src="docs/images/agent-deck.jpg" alt="Agent Deck on a Stream Deck: the CPU/RAM key, a sleeping session and a working session" width="720">
</p>

> Inspired by [CodeIsland](https://github.com/wxtsky/CodeIsland), which is also where the mascot design comes from. See [Credits](#credits).

## Keys

| Key | Shows | Press |
| --- | --- | --- |
| **Agent Session** | One session: project name, mascot, state | Jump to its terminal window or tab |
| **Next Waiting** | How many sessions are waiting for you | Jump to the most urgent one |
| **System Monitor** | CPU and RAM use | Open Task Manager |
| **Claude App** | Whether the Claude desktop app is running | Bring it to the front, starting it if needed |
| **Claude Here** | A folder icon | Start `claude` in the focused Explorer folder (Windows Terminal → WSL) |

States on an Agent Session key:

| Colour | Mascot | Text | Meaning |
| --- | --- | --- | --- |
| Blue | Typing | `WORKING 1:23` | Working |
| Amber, pulsing | Waving, `!` or `?` bubble | `APPROVE?` / `QUESTION` / `NEEDS YOU` | Waiting for you |
| Green | Arms up, check mark | `DONE` | Turn finished |
| Dark grey | Asleep | `Zzz` | Already seen, or idle |
| Red | X eyes | `ERROR` | Stopped on an API error |

## Requirements

- Windows 10/11 and the Stream Deck app 7.0 or later
- Claude Code for Windows 2.1.119 or later, started from any shell (cmd, PowerShell, Windows Terminal, or a WSL shell that calls the Windows `claude`)
- Node.js 20 or later and git, to build from source
- For Claude Here: WSL and Windows Terminal. For Claude App: the Claude desktop app.

## Install

```powershell
git clone https://github.com/hyeonbeomy/agent-deck.git
cd agent-deck
npm install
npm run build
npm run link
```

Quit the Stream Deck app completely and start it again, then drag the keys from the **Agent Deck** category onto the deck. Sessions started on Windows show up by themselves; no hook is needed.

`npm run link` needs Windows Developer Mode. If it fails, or for a PC without Node.js, run `npm run pack` and double-click the `.streamDeckPlugin` file it creates.

## Usage

- **Key order**: sessions fill the Agent Session keys from the top left in the order they were started. To tie a key to one project, type its folder name into the key's 고정할 프로젝트 (pinned project) field.
- **Next Waiting** goes through approvals and questions first, then errors, then finished turns you have not looked at.
- **Claude Here** uses the folder of the focused Explorer window (or its one selected sub-folder), then the Explorer window under the cursor, the desktop, the default folder from the key's settings, and last your home folder. Click the Explorer window, then press the key. Locations WSL has not mounted (NAS shares, network drives, Google Drive) are mounted under `/mnt/` first. The new session gets its key once you answer Claude's "trust this folder?" prompt.
- **Optional hook**: `node hooks\windows\install.mjs` adds the approval / question distinction, tool names and the error state, and tells sessions with identical titles apart. It edits `~/.claude/settings.json` after writing a backup; `--uninstall` removes it. A Linux claude installed inside WSL needs `bash hooks/wsl/install.sh` to be seen at all.

Everything else is in [docs/reference.md](docs/reference.md): how windows are found, Codex, hook options, debug endpoints, the full troubleshooting table and the source layout.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Keys never change | Run `npm run simulate`, then open `http://127.0.0.1:39217/state`. Sessions need Claude Code 2.1.119 or later on Windows. |
| ⚠ flashes when a key is pressed | Read the plugin log in `com.hbyi.agentdeck.sdPlugin/logs`. `exit 1` means no window was found, `exit 2` that Windows refused the switch. |
| Claude Here opens your home folder | No Explorer window was focused. Click it first, or set a default folder on the key. |
| The plugin does not load, or a new build is not picked up | Quit the Stream Deck app and start it again. |

## Credits

- The idea and the **mascot design** come from **[CodeIsland](https://github.com/wxtsky/CodeIsland)** (Copyright (c) 2026 wxtsky, MIT License), which shows AI coding agent status in the macOS notch. The mascot was redrawn in code (`src/mascot.ts`) after CodeIsland's Claude mascot. No file from CodeIsland is included, and its license notice is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The plugin's code was written from scratch.
- The mascot is reminiscent of Claude Code's own orange pixel character. Claude and Claude Code are trademarks of Anthropic, Codex of OpenAI, and Stream Deck of Elgato. This is an unofficial personal project with no relation to those companies.
