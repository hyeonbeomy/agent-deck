#!/usr/bin/env node
// Agent Deck - fake sessions for checking the keys without running Claude Code or Codex.
//
//   npm run simulate          play a short scripted session (Claude + Codex)
//   npm run simulate -- end   remove the fake sessions again
//
// Run it on the machine where the Stream Deck app is running.

const port = process.env.AGENT_DECK_PORT ?? "39217";
const base = `http://127.0.0.1:${port}`;
const sid = "00000000-demo-4000-8000-000000000001";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ts = Date.now();

async function claude(event, extra = {}) {
	ts += 1;
	const body = {
		deck: { token: "[cc:00000000]", label: "demo-project", ts },
		session_id: sid,
		cwd: "/home/demo/demo-project",
		hook_event_name: event,
		...extra
	};
	await post("/claude", body);
	console.log(`claude  ${event}${extra.tool_name ? ` (${extra.tool_name})` : ""}${extra.notification_type ? ` (${extra.notification_type})` : ""}`);
}

async function codex() {
	await post("/codex", {
		type: "agent-turn-complete",
		"thread-id": "demo-codex-thread",
		cwd: "C:\\work\\codex-demo",
		deck: { label: "codex-demo", ts: Date.now() }
	});
	console.log("codex   agent-turn-complete");
}

async function post(path, body) {
	const res = await fetch(base + path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
}

try {
	await fetch(`${base}/health`);
} catch {
	console.error(`Can't reach the plugin at ${base}. Is the Stream Deck app running with Agent Deck installed?`);
	process.exit(1);
}

if (process.argv[2] === "end") {
	await claude("SessionEnd", { reason: "other" });
	console.log("(the Codex demo key clears after 12 h of silence, or restart the plugin)");
	process.exit(0);
}

await claude("SessionStart", { source: "startup" });
await sleep(1500);
await claude("UserPromptSubmit", { prompt: "demo" });
await sleep(1500);
await claude("PreToolUse", { tool_name: "Read" });
await sleep(1000);
await claude("PostToolUse", { tool_name: "Read" });
await claude("PreToolUse", { tool_name: "Bash" });
await sleep(800);
await claude("PermissionRequest", { tool_name: "Bash" });
console.log("        -> key should pulse amber for 5 s");
await sleep(5000);
await claude("PostToolUse", { tool_name: "Bash" });
await sleep(2500);
await claude("Stop");
await codex();
console.log("done. Both keys should now be green (DONE, mascot cheering). Press one to mark it seen (it falls asleep).");
console.log("Run `npm run simulate -- end` to remove the Claude demo session.");
