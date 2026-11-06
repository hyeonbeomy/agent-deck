// Agent Deck - add or remove the Agent Deck hook entries in a Claude Code settings object.
// Pure functions (no I/O) so install.mjs stays small and this logic can be unit-tested.

/** Any hook whose command or args mention this file belongs to Agent Deck. */
export const HOOK_MARK = "agent-deck-hook.mjs";

/** These must finish before Claude goes on: they print the terminal-title JSON. */
export const SYNC_EVENTS = ["SessionStart", "UserPromptSubmit", "Stop"];
/** These only report state, so they run in the background. */
export const ASYNC_EVENTS = ["PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "Notification", "StopFailure", "SessionEnd"];

/** Claude Code's own title updates would overwrite the "[cc:...]" marker; this turns them off. */
export const TITLE_ENV = "CLAUDE_CODE_DISABLE_TERMINAL_TITLE";

function isAgentDeckHook(hook) {
	if (typeof hook !== "object" || hook === null) return false;
	const parts = [hook.command, ...(Array.isArray(hook.args) ? hook.args : [])];
	return parts.some((v) => typeof v === "string" && v.includes(HOOK_MARK));
}

/** A copy of `hooks` without any Agent Deck entries; groups and events left empty are dropped. */
export function stripAgentDeckHooks(hooks) {
	const out = {};
	for (const [event, groups] of Object.entries(hooks ?? {})) {
		if (!Array.isArray(groups)) {
			out[event] = groups;
			continue;
		}
		const kept = [];
		for (const group of groups) {
			if (typeof group !== "object" || group === null || !Array.isArray(group.hooks)) {
				kept.push(group);
				continue;
			}
			const remaining = group.hooks.filter((h) => !isAgentDeckHook(h));
			if (remaining.length > 0) kept.push({ ...group, hooks: remaining });
		}
		if (kept.length > 0) out[event] = kept;
	}
	return out;
}

/**
 * Returns a new settings object with Agent Deck installed or removed.
 * @param settings  parsed ~/.claude/settings.json (may be undefined)
 * @param opts      { mode: "install" | "uninstall", nodePath, hookPath, keepTitle }
 */
export function mergeSettings(settings, { mode, nodePath, hookPath, keepTitle = false }) {
	const data = structuredClone(settings ?? {});
	const hooks = stripAgentDeckHooks(data.hooks);
	const env = { ...(data.env ?? {}) };

	if (mode === "install") {
		// Exec form: no shell involved, so it works whether Claude Code uses Git Bash or PowerShell.
		const entry = (extra) => ({ hooks: [{ type: "command", command: nodePath, args: [hookPath], ...extra }] });
		for (const event of SYNC_EVENTS) (hooks[event] ??= []).push(entry({ timeout: 5 }));
		for (const event of ASYNC_EVENTS) (hooks[event] ??= []).push(entry({ async: true }));
		if (!keepTitle) env[TITLE_ENV] = "1";
	} else if (env[TITLE_ENV] === "1") {
		delete env[TITLE_ENV];
	}

	if (Object.keys(hooks).length > 0) data.hooks = hooks;
	else delete data.hooks;
	if (Object.keys(env).length > 0) data.env = env;
	else delete data.env;
	return data;
}
