#!/usr/bin/env node
// Agent Deck - Codex notify hook for Codex running natively on Windows.
//
// %USERPROFILE%\.codex\config.toml:
//   notify = ["node", "C:\\path\\to\\agent-deck\\hooks\\windows\\codex-notify.mjs"]
//
// Codex runs this after every finished turn with the event JSON as the last argument.

import path from "node:path";

const port = process.env.AGENT_DECK_PORT ?? "39217";
const raw = process.argv.at(-1);

let payload;
try {
	payload = JSON.parse(raw ?? "");
} catch {
	process.exit(0);
}
if (typeof payload !== "object" || payload === null) process.exit(0);

const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
payload.deck = {
	label: process.env.AGENT_DECK_LABEL || path.win32.basename(cwd) || path.posix.basename(cwd),
	ts: Date.now()
};

try {
	await fetch(`http://127.0.0.1:${port}/codex`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(2000)
	});
} catch {
	// Plugin not running: nothing to do.
}
