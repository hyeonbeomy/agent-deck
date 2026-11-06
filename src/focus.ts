import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Session } from "./sessions";

// bin/plugin.js -> <plugin>.sdPlugin
const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const focusScript = path.join(pluginDir, "scripts", "focus-window.ps1");

/**
 * Bring the terminal window (or Windows Terminal tab) of a session to the front. Tried in order:
 *   1. the unique token the hook writes into the terminal title (exact tab)
 *   2. the session's process id from ~/.claude/sessions: the first ancestor that owns a visible
 *      window (Windows Terminal, conhost, mintty, VS Code, ...) is focused
 *   3. the project name in a terminal window title (Codex, best effort)
 * Resolves true if a window was found and focused.
 */
export function focusSession(s: Session): Promise<boolean> {
	if (process.platform !== "win32") {
		// macOS / others: not implemented yet (see README, "Mac").
		return Promise.resolve(false);
	}
	const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", focusScript];
	if (s.token) args.push("-Match", s.token);
	if (s.pid) args.push("-ProcessId", String(s.pid));
	if (s.label) args.push("-Fallback", s.label);
	if (!s.token && !s.pid && !s.label) return Promise.resolve(false);

	return new Promise((resolve) => {
		execFile("powershell.exe", args, { windowsHide: true, timeout: 10000 }, (err) => resolve(!err));
	});
}
