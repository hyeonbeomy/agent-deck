# shellcheck shell=bash
# Agent Deck - helpers shared by the WSL hook scripts. Sourced, not executed.
#
# Settings (environment variables):
#   AGENT_DECK_PORT       port of the Stream Deck plugin on Windows (default 39217)
#   AGENT_DECK_TRANSPORT  auto | linux | win   (default auto)
#                         linux = WSL's own curl to 127.0.0.1 (works with WSL "mirrored" networking)
#                         win   = Windows curl.exe through WSL interop (works with the default NAT networking)
#                         auto  = try linux first, then win
#   AGENT_DECK_LABEL      name to show on the key instead of the project folder name

AGENT_DECK_PORT="${AGENT_DECK_PORT:-39217}"
AGENT_DECK_TRANSPORT="${AGENT_DECK_TRANSPORT:-auto}"

agent_deck_json_escape() {
	local s=$1
	s=${s//\\/\\\\}
	s=${s//\"/\\\"}
	s=${s//$'\t'/\\t}
	s=${s//$'\n'/\\n}
	s=${s//$'\r'/\\r}
	printf '%s' "$s"
}

agent_deck_now_ms() {
	local t
	t=$(date +%s%3N 2>/dev/null)
	case "$t" in
		*N | '') echo "$(($(date +%s) * 1000))" ;;
		*) echo "$t" ;;
	esac
}

# First top-level string value of a key in a JSON document (good enough for hook payloads,
# whose common fields come first). Usage: agent_deck_field "$json" session_id
agent_deck_field() {
	printf '%s' "$1" | grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -n 1 | sed 's/.*:[[:space:]]*"\(.*\)"$/\1/'
}

# Insert {"deck": {...}} as the first field of a JSON object.
# Usage: agent_deck_with_meta "$json" "$deck_object_json"
agent_deck_with_meta() {
	local json=$1 deck=$2 rest
	rest="${json#"${json%%[![:space:]]*}"}" # trim leading whitespace
	rest="${rest#\{}"
	rest="${rest#"${rest%%[![:space:]]*}"}"
	case "$rest" in
		\}* | '') printf '{"deck":%s}' "$deck" ;;
		*) printf '{"deck":%s,%s' "$deck" "$rest" ;;
	esac
}

agent_deck_win_curl() {
	if [ -x /mnt/c/Windows/System32/curl.exe ]; then
		echo /mnt/c/Windows/System32/curl.exe
	else
		command -v curl.exe 2>/dev/null
	fi
}

# POST a JSON body to the plugin. Usage: agent_deck_post /claude "$body"
agent_deck_post() {
	local url="http://127.0.0.1:${AGENT_DECK_PORT}$1" body=$2 exe
	if [ "$AGENT_DECK_TRANSPORT" != win ] && command -v curl >/dev/null 2>&1; then
		printf '%s' "$body" | curl -s -o /dev/null --connect-timeout 1 -m 3 -X POST \
			-H "Content-Type: application/json" --data-binary @- "$url" && return 0
	fi
	if [ "$AGENT_DECK_TRANSPORT" != linux ]; then
		exe=$(agent_deck_win_curl)
		if [ -n "$exe" ]; then
			printf '%s' "$body" | "$exe" -s -o NUL --connect-timeout 2 -m 4 -X POST \
				-H "Content-Type: application/json" --data-binary @- "$url" && return 0
		fi
	fi
	return 1
}

# GET /health. Prints which transport works. Usage: agent_deck_check
agent_deck_check() {
	local url="http://127.0.0.1:${AGENT_DECK_PORT}/health" exe
	if command -v curl >/dev/null 2>&1 && curl -s --connect-timeout 1 -m 2 "$url" | grep -q ok; then
		echo linux
		return 0
	fi
	exe=$(agent_deck_win_curl)
	if [ -n "$exe" ] && "$exe" -s --connect-timeout 2 -m 3 "$url" | grep -q ok; then
		echo win
		return 0
	fi
	return 1
}
