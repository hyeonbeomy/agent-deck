#!/usr/bin/env bash
# Agent Deck - install the Claude Code hooks inside WSL.
#
#   ./install.sh               install or update (safe to re-run)
#   ./install.sh --keep-title  don't turn off Claude Code's own terminal-title updates
#   ./install.sh --uninstall   remove the hooks again
#
# What it does:
#   - copies the hook scripts to ~/.claude/agent-deck/
#   - adds hook entries to ~/.claude/settings.json (a timestamped backup is made first)
#   - sets CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1 so Claude Code doesn't overwrite the
#     "[cc:...]" marker the plugin uses to find each session's window
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="$HOME/.claude/agent-deck"
settings="$HOME/.claude/settings.json"
mode=install
keep_title=0

for arg in "$@"; do
	case "$arg" in
		--uninstall) mode=uninstall ;;
		--keep-title) keep_title=1 ;;
		*)
			echo "unknown option: $arg" >&2
			exit 2
			;;
	esac
done

command -v python3 >/dev/null 2>&1 || {
	echo "python3 is needed to edit settings.json (sudo apt install python3)" >&2
	exit 1
}

mkdir -p "$HOME/.claude"
if [ -s "$settings" ]; then
	backup="$settings.bak.$(date +%Y%m%d-%H%M%S)"
	cp "$settings" "$backup"
	echo "backup: $backup"
fi

if [ "$mode" = install ]; then
	mkdir -p "$dest"
	install -m 755 "$src/agent-deck-hook.sh" "$src/codex-notify.sh" "$dest/"
	install -m 644 "$src/agent-deck-lib.sh" "$dest/"
	# Scripts may arrive with Windows line endings if they were copied through Explorer.
	sed -i 's/\r$//' "$dest"/*.sh
fi

python3 - "$settings" "$dest/agent-deck-hook.sh" "$mode" "$keep_title" <<'PY'
import json, os, sys

path, hook, mode, keep_title = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == "1"
MARK = "agent-deck-hook.sh"

data = {}
if os.path.exists(path) and os.path.getsize(path) > 0:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

hooks = data.setdefault("hooks", {})

# Drop any earlier Agent Deck entries, keep everything else untouched.
for event in list(hooks):
    groups = []
    for group in hooks[event]:
        group = dict(group)
        group["hooks"] = [h for h in group.get("hooks", []) if MARK not in str(h.get("command", ""))]
        if group["hooks"]:
            groups.append(group)
    if groups:
        hooks[event] = groups
    else:
        del hooks[event]

env = data.setdefault("env", {})
if mode == "install":
    # These run in the foreground (fast: they only print the terminal-title JSON).
    for event in ["SessionStart", "UserPromptSubmit", "Stop"]:
        hooks.setdefault(event, []).append({"hooks": [{"type": "command", "command": hook, "timeout": 5}]})
    # These only report state, so they run in the background.
    for event in ["PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest",
                  "Notification", "StopFailure", "SessionEnd"]:
        hooks.setdefault(event, []).append({"hooks": [{"type": "command", "command": hook, "async": True}]})
    if not keep_title:
        env["CLAUDE_CODE_DISABLE_TERMINAL_TITLE"] = "1"
elif env.get("CLAUDE_CODE_DISABLE_TERMINAL_TITLE") == "1":
    del env["CLAUDE_CODE_DISABLE_TERMINAL_TITLE"]

if not env:
    data.pop("env", None)
if not hooks:
    data.pop("hooks", None)

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY

if [ "$mode" = uninstall ]; then
	rm -rf "$dest"
	echo "Agent Deck hooks removed. Restart running Claude Code sessions."
	exit 0
fi

echo "hooks installed: $dest"
echo

# shellcheck source=agent-deck-lib.sh
. "$dest/agent-deck-lib.sh"
if transport=$(agent_deck_check); then
	echo "Stream Deck plugin reachable (transport: $transport)."
	if [ "$transport" = win ]; then
		echo "  tip: add 'export AGENT_DECK_TRANSPORT=win' to ~/.bashrc to skip the WSL-curl attempt."
	fi
else
	echo "WARNING: can't reach the plugin on 127.0.0.1:${AGENT_DECK_PORT}."
	echo "  - Is the Stream Deck app running with the Agent Deck plugin installed?"
	echo "  - Is WSL interop on? (/mnt/c/Windows/System32/curl.exe should be runnable)"
fi

cat <<EOF

Next:
  - Restart any Claude Code sessions that are already running.
  - Codex inside WSL: add this line to ~/.codex/config.toml (replaces an existing notify line):
      notify = ["$dest/codex-notify.sh"]
EOF
