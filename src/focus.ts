import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Session } from "./sessions";

// bin/plugin.js -> <plugin>.sdPlugin
const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const focusScript = path.join(pluginDir, "scripts", "focus-window.ps1");

/** Compiling the C# helper, a CIM query and UI Automation can take a few seconds on a busy machine. */
const SCRIPT_TIMEOUT_MS = 15000;

export type FocusResult = {
	/** True when a window was found and is now in the foreground. */
	ok: boolean;
	/** focus-window.ps1 exit code: 0 focused, 1 not found, 2 found but Windows refused. null = the script did not run. */
	code: number | null;
	/** stderr or spawn error, trimmed; empty on success. */
	detail: string;
	/** Wall time of the attempt. */
	ms: number;
};

/**
 * PowerShell arguments for a session, or undefined when there is nothing to search for.
 * The script tries the title token, then the process id, then the label, in that order.
 */
export function focusArgs(s: Pick<Session, "token" | "pid" | "label">, script = focusScript): string[] | undefined {
	if (!s.token && !s.pid && !s.label) return undefined;
	const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script];
	if (s.token) args.push("-Match", s.token);
	if (s.pid) args.push("-ProcessId", String(s.pid));
	if (s.label) args.push("-Fallback", s.label);
	return args;
}

/**
 * Bring the terminal window (or Windows Terminal tab) of a session to the front. Tried in order:
 *   1. the unique token the hook writes into the terminal title (exact tab)
 *   2. the session's process id from ~/.claude/sessions: the title of its console, matched
 *      against terminal windows and Windows Terminal tabs (exact tab), then the first ancestor
 *      that owns a visible window (Windows Terminal, conhost, mintty, VS Code, ...)
 *   3. the project name in a terminal window title (Codex, best effort)
 */
export function focusSession(s: Session): Promise<FocusResult> {
	const started = Date.now();
	const result = (ok: boolean, code: number | null, detail = ""): FocusResult => ({
		ok,
		code,
		detail: detail.trim().slice(0, 400),
		ms: Date.now() - started
	});

	if (process.platform !== "win32") {
		// macOS / others: not implemented yet (see README, "Mac").
		return Promise.resolve(result(false, null, "window focus is only implemented on Windows"));
	}
	const args = focusArgs(s);
	if (!args) return Promise.resolve(result(false, null, "session has no title token, pid or label"));

	return new Promise((resolve) => {
		execFile("powershell.exe", args, { windowsHide: true, timeout: SCRIPT_TIMEOUT_MS }, (err, _stdout, stderr) => {
			if (!err) {
				resolve(result(true, 0));
				return;
			}
			const code = typeof err.code === "number" ? err.code : null;
			const detail = err.killed ? `timed out after ${SCRIPT_TIMEOUT_MS} ms` : stderr || err.message;
			resolve(result(false, code, detail));
		});
	});
}
