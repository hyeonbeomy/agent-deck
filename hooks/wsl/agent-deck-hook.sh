#!/usr/bin/env bash
# Agent Deck - Claude Code hook (runs inside WSL).
#
# install.sh registers this script for the hook events the Stream Deck plugin cares about.
# Each run:
#   1. forwards the event to the plugin on Windows, in the background, so Claude never waits on it
#   2. on SessionStart / UserPromptSubmit / Stop, asks Claude Code to set the terminal title to
#      "<project> [cc:<session id>]" - that marker is how the plugin finds this session's window
#
# Set AGENT_DECK_SET_TITLE=0 to leave the terminal title alone (key presses then can't find the window).
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=agent-deck-lib.sh
. "$here/agent-deck-lib.sh"

payload="$(cat)"
event=$(agent_deck_field "$payload" hook_event_name)
sid=$(agent_deck_field "$payload" session_id)
[ -n "$event" ] && [ -n "$sid" ] || exit 0

label="${AGENT_DECK_LABEL:-$(basename "${CLAUDE_PROJECT_DIR:-$PWD}")}"
token="[cc:${sid:0:8}]"

deck=$(printf '{"token":"%s","label":"%s","ts":%s,"distro":"%s"}' \
	"$(agent_deck_json_escape "$token")" \
	"$(agent_deck_json_escape "$label")" \
	"$(agent_deck_now_ms)" \
	"$(agent_deck_json_escape "${WSL_DISTRO_NAME:-}")")
body=$(agent_deck_with_meta "$payload" "$deck")

# Double fork with all streams closed: the post outlives this hook and Claude doesn't wait for it.
(agent_deck_post /claude "$body" </dev/null >/dev/null 2>&1 &)

case "$event" in
	SessionStart | UserPromptSubmit | Stop)
		if [ "${AGENT_DECK_SET_TITLE:-1}" = 1 ]; then
			# Claude Code writes this OSC 0 (window title) sequence to the terminal for us.
			printf '{"terminalSequence":"\\u001b]0;%s\\u0007"}\n' "$(agent_deck_json_escape "$label $token")"
		fi
		;;
esac
exit 0
