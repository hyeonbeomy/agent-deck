#!/usr/bin/env bash
# Agent Deck - Codex notify hook (Codex running inside WSL).
#
# ~/.codex/config.toml:
#   notify = ["/home/<you>/.claude/agent-deck/codex-notify.sh"]
#
# Codex runs this after every finished turn with the event JSON as the last argument.
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=agent-deck-lib.sh
. "$here/agent-deck-lib.sh"

payload="${*: -1}"
[ -n "$payload" ] || exit 0

cwd=$(agent_deck_field "$payload" cwd)
label="${AGENT_DECK_LABEL:-$(basename "${cwd:-$PWD}")}"

deck=$(printf '{"label":"%s","ts":%s}' "$(agent_deck_json_escape "$label")" "$(agent_deck_now_ms)")
body=$(agent_deck_with_meta "$payload" "$deck")

(agent_deck_post /codex "$body" </dev/null >/dev/null 2>&1 &)
exit 0
