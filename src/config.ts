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

/** How often the CPU/RAM key samples and redraws. */
export const SYSMON_SAMPLE_MS = 1000;

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
	ram: "RAM"
} as const;
