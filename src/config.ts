/**
 * Shared constants. The hook scripts use the same port (AGENT_DECK_PORT, default 39217).
 */
export const SERVER_HOST = "127.0.0.1";
export const SERVER_PORT = Number(process.env.AGENT_DECK_PORT ?? 39217);

/** Sessions with no events for this long are dropped (e.g. a terminal closed without SessionEnd). */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

/** A finished turn nobody jumped to for this long stops celebrating and goes to sleep. */
export const DONE_TO_SLEEP_MS = 15 * 60 * 1000;

/** How often keys are redrawn (mascot animation frames, elapsed time, pulsing). */
export const TICK_MS = 500;

/** How often ~/.claude/sessions is re-read to discover native (Windows) Claude Code sessions. */
export const REGISTRY_POLL_MS = 1000;

/**
 * Registry entrypoints that never become session keys. The Claude desktop app runs Claude Code
 * for its own sessions and keeps those processes alive in the background after the session has
 * left the screen, so they would appear as keys for sessions the user cannot see. Terminal
 * sessions have the entrypoint "cli".
 */
export const HIDDEN_ENTRYPOINTS: readonly string[] = ["claude-desktop"];

/** How often the CPU/RAM key samples and redraws. */
export const SYSMON_SAMPLE_MS = 1000;

/** How often the Claude App key checks whether the desktop app is running. */
export const CLAUDE_APP_POLL_MS = 5000;

/** Text drawn on keys. Kept in one place so it is easy to switch wording or language. */
export const LABELS = {
	ready: "Zzz",
	working: "WORKING",
	attention: "APPROVE?",
	question: "QUESTION",
	input: "NEEDS YOU",
	done: "DONE",
	seen: "Zzz",
	error: "ERROR",
	empty: "—",
	waitingNone: "ALL CLEAR",
	waitingSome: "WAITING",
	cpu: "CPU",
	ram: "RAM",
	claudeApp: "CLAUDE APP",
	appRunning: "RUNNING",
	appOff: "OFF",
	claudeHere: "CLAUDE HERE",
	wslHint: "WSL · TERMINAL"
} as const;
