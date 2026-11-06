#!/usr/bin/env node
// Agent Deck - install the Claude Code hooks for Claude Code running natively on Windows.
//
//   node hooks\windows\install.mjs               install or update (safe to re-run)
//   node hooks\windows\install.mjs --keep-title  don't turn off Claude Code's own terminal-title updates
//   node hooks\windows\install.mjs --uninstall   remove the hooks again
//
// What it does:
//   - copies the hook scripts to %USERPROFILE%\.claude\agent-deck\
//   - adds hook entries to %USERPROFILE%\.claude\settings.json (a timestamped backup is made first);
//     hooks of other tools are left untouched, earlier Agent Deck entries are replaced
//   - sets CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1 so Claude Code doesn't overwrite the
//     "[cc:...]" marker the plugin uses to find each session's window
//
// The plugin also discovers native sessions on its own through ~/.claude/sessions, so the keys
// work without this; the hook adds exact tab focus, tool names and the question/approval split.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mergeSettings } from "./settings-merge.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.AGENT_DECK_PORT ?? "39217";

let mode = "install";
let keepTitle = false;
for (const arg of process.argv.slice(2)) {
	if (arg === "--uninstall") mode = "uninstall";
	else if (arg === "--keep-title") keepTitle = true;
	else {
		console.error(`unknown option: ${arg}`);
		process.exit(2);
	}
}

const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const dest = path.join(configDir, "agent-deck");
const settingsPath = path.join(configDir, "settings.json");
const slash = (p) => p.replace(/\\/g, "/");

let settings;
if (fs.existsSync(settingsPath) && fs.statSync(settingsPath).size > 0) {
	try {
		settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
	} catch (err) {
		console.error(`${settingsPath} is not valid JSON (${err.message}); fix it first.`);
		process.exit(1);
	}
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
	const backup = `${settingsPath}.bak.${stamp}`;
	fs.copyFileSync(settingsPath, backup);
	console.log(`backup: ${backup}`);
}

fs.mkdirSync(configDir, { recursive: true });
if (mode === "install") {
	fs.mkdirSync(dest, { recursive: true });
	for (const file of ["agent-deck-hook.mjs", "codex-notify.mjs"]) fs.copyFileSync(path.join(here, file), path.join(dest, file));
}

const merged = mergeSettings(settings, {
	mode,
	nodePath: slash(process.execPath),
	hookPath: slash(path.join(dest, "agent-deck-hook.mjs")),
	keepTitle
});
fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + "\n", "utf8");

if (mode === "uninstall") {
	fs.rmSync(dest, { recursive: true, force: true });
	console.log("Agent Deck hooks removed. Restart running Claude Code sessions.");
	process.exit(0);
}

console.log(`hooks installed: ${dest}`);
console.log(`settings updated: ${settingsPath}`);
console.log();

try {
	const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
	console.log(res.ok ? `Stream Deck plugin reachable on 127.0.0.1:${port}.` : `Plugin answered HTTP ${res.status} on 127.0.0.1:${port}.`);
} catch {
	console.log(`WARNING: can't reach the plugin on 127.0.0.1:${port}.`);
	console.log("  - Is the Stream Deck app running with the Agent Deck plugin installed?");
}

console.log(`
Next:
  - Restart any Claude Code sessions that are already running (hooks are read at startup).
  - Codex on Windows: add this line to %USERPROFILE%\\.codex\\config.toml (replaces an existing notify line):
      notify = ["${slash(process.execPath)}", "${slash(path.join(dest, "codex-notify.mjs"))}"]
`);
