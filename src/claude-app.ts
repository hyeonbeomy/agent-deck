import { runScript, type ScriptResult } from "./powershell";

/**
 * Claude desktop app detection. The CLI is also called claude.exe, but only the desktop app's
 * main process owns a window titled "Claude", so tasklist's window-title filter tells them apart.
 */
export const TASKLIST_ARGS = ["/FI", "IMAGENAME eq claude.exe", "/FI", "WINDOWTITLE eq Claude", "/FO", "CSV", "/NH"] as const;

/** True when `tasklist /FO CSV /NH` printed at least one process row (a quoted CSV line). */
export function parseTasklist(output: string): boolean {
	return output.split(/\r?\n/).some((l) => l.startsWith('"') && l.includes('","'));
}

/** Bring the Claude desktop app to the front, starting it first when it is not running. */
export function showClaudeApp(): Promise<ScriptResult> {
	// Starting the app and waiting for its window can take several seconds.
	return runScript("claude-app.ps1", [], 20000);
}
