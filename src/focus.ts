import { runScript, type ScriptResult } from "./powershell";
import type { Session } from "./sessions";

export type FocusResult = ScriptResult;

/**
 * focus-window.ps1 parameters for a session, or undefined when there is nothing to search for.
 * The script tries the title token, then the process id, then the label, in that order.
 */
export function focusArgs(s: Pick<Session, "token" | "pid" | "label">): string[] | undefined {
	if (!s.token && !s.pid && !s.label) return undefined;
	const args: string[] = [];
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
	const args = focusArgs(s);
	if (!args) return Promise.resolve({ ok: false, code: null, detail: "session has no title token, pid or label", ms: 0 });
	return runScript("focus-window.ps1", args);
}
