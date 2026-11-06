#!/usr/bin/env node
// Agent Deck - Claude Code hook for Claude Code running natively on Windows.
//
// install.mjs registers this script (exec form: node.exe + this file, no shell) for the hook
// events the Stream Deck plugin cares about. Each run:
//   1. forwards the event to the plugin on 127.0.0.1:39217 (AGENT_DECK_PORT)
//   2. on SessionStart / UserPromptSubmit / Stop, asks Claude Code to set the terminal title to
//      "<project> [cc:<session id>]" - that marker is how the plugin finds this session's window
//
// Environment:
//   AGENT_DECK_PORT       plugin port (default 39217)
//   AGENT_DECK_LABEL      name to show on the key instead of the project folder name
//   AGENT_DECK_SET_TITLE  0 = leave the terminal title alone (key presses then fall back to the
//                         session's process id to find the window)

import path from "node:path";

const port = process.env.AGENT_DECK_PORT ?? "39217";
const setTitle = process.env.AGENT_DECK_SET_TITLE !== "0";
const TITLE_EVENTS = new Set(["SessionStart", "UserPromptSubmit", "Stop"]);

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

let payload;
try {
	payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
	process.exit(0);
}
if (typeof payload !== "object" || payload === null) process.exit(0);

const event = payload.hook_event_name;
const sessionId = payload.session_id;
if (typeof event !== "string" || typeof sessionId !== "string" || sessionId.length === 0) process.exit(0);

const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const rawLabel = process.env.AGENT_DECK_LABEL || path.win32.basename(cwd) || path.posix.basename(cwd) || sessionId.slice(0, 8);
// The label ends up inside an OSC title sequence: keep control characters out of it.
const label = rawLabel.replace(/[\u0000-\u001f\u007f]/g, "");
const token = `[cc:${sessionId.slice(0, 8)}]`;

// Printed first so Claude Code never waits on the network for it. Claude Code emits the
// sequence to the terminal on our behalf (hooks have no access to the terminal themselves).
if (setTitle && TITLE_EVENTS.has(event)) {
	process.stdout.write(JSON.stringify({ terminalSequence: `\u001b]0;${label} ${token}\u0007` }) + "\n");
}

try {
	await fetch(`http://127.0.0.1:${port}/claude`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...payload, deck: { token, label, ts: Date.now() } }),
		signal: AbortSignal.timeout(1500)
	});
} catch {
	// Plugin not running: nothing to do.
}
