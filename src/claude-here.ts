import fs from "node:fs";
import path from "node:path";

import { runScript, type ScriptResult } from "./powershell";
import { claudeConfigDir } from "./registry";

/** Property-inspector settings of the "Claude Here" key. */
export type ClaudeHereSettings = {
	/** Folder used when no Explorer window is focused or under the cursor. */
	defaultFolder?: string;
	/** WSL distribution name; empty = the default distribution. */
	distro?: string;
	/** Windows Terminal profile name for the new tab's looks; empty = default profile. */
	profile?: string;
	/** Open a tab in the last used Windows Terminal window instead of a new window. */
	tab?: boolean;
	/** Keep the shell open after claude exits. */
	keepShell?: boolean;
};

/**
 * Does the user's Claude Code settings.json ask for the fullscreen interface (prompt pinned at
 * the bottom)? Claude Code switches fullscreen off on its own after two failed starts; a key
 * press should still open the interface the user chose.
 */
export function wantsFullscreen(settingsJson: string): boolean {
	try {
		const data: unknown = JSON.parse(settingsJson);
		return typeof data === "object" && data !== null && !Array.isArray(data) && (data as Record<string, unknown>).tui === "fullscreen";
	} catch {
		return false;
	}
}

/** claude-here.ps1 parameters: text settings as named parameters, booleans as switches. */
export function claudeHereArgs(s: ClaudeHereSettings | undefined, opts: { fullscreen?: boolean } = {}): string[] {
	const args: string[] = [];
	const text = (name: string, value?: string): void => {
		const v = value?.trim();
		if (v) args.push(name, v);
	};
	text("-DefaultFolder", s?.defaultFolder);
	text("-Distro", s?.distro);
	// -Profile would shadow PowerShell's automatic $PROFILE variable.
	text("-TerminalProfile", s?.profile);
	if (s?.tab) args.push("-Tab");
	if (s?.keepShell) args.push("-KeepShell");
	if (opts.fullscreen) args.push("-Fullscreen");
	return args;
}

function claudeSettingsText(): string {
	try {
		return fs.readFileSync(path.join(claudeConfigDir(), "settings.json"), "utf8");
	} catch {
		return "";
	}
}

/**
 * Start claude in the folder of the focused Explorer window (see scripts/claude-here.ps1 for
 * the fallbacks). Mounting a network share in WSL first can take a while, hence the long timeout.
 */
export function startClaudeHere(settings: ClaudeHereSettings | undefined): Promise<ScriptResult> {
	const fullscreen = wantsFullscreen(claudeSettingsText());
	return runScript("claude-here.ps1", claudeHereArgs(settings, { fullscreen }), 45000);
}
