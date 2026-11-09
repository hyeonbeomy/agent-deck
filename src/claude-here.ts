import { runScript, type ScriptResult } from "./powershell";

/** Property-inspector settings of the "Claude Here" key. */
export type ClaudeHereSettings = {
	/** Folder used when no Explorer window is focused or under the cursor. */
	defaultFolder?: string;
	/** WSL distribution name; empty = the default distribution. */
	distro?: string;
	/** Windows Terminal profile name for the new tab's looks; empty = default profile. */
	profile?: string;
	/** Open a new Windows Terminal window instead of a tab in the last used one. */
	newWindow?: boolean;
	/** Keep the shell open after claude exits. */
	keepShell?: boolean;
};

/** claude-here.ps1 parameters: text settings as named parameters, booleans as switches. */
export function claudeHereArgs(s: ClaudeHereSettings | undefined): string[] {
	const args: string[] = [];
	if (!s) return args;
	const text = (name: string, value?: string): void => {
		const v = value?.trim();
		if (v) args.push(name, v);
	};
	text("-DefaultFolder", s.defaultFolder);
	text("-Distro", s.distro);
	// -Profile would shadow PowerShell's automatic $PROFILE variable.
	text("-TerminalProfile", s.profile);
	if (s.newWindow) args.push("-NewWindow");
	if (s.keepShell) args.push("-KeepShell");
	return args;
}

/**
 * Start claude in the folder of the focused Explorer window (see scripts/claude-here.ps1 for
 * the fallbacks). Mounting a network share in WSL first can take a while, hence the long timeout.
 */
export function startClaudeHere(settings: ClaudeHereSettings | undefined): Promise<ScriptResult> {
	return runScript("claude-here.ps1", claudeHereArgs(settings), 45000);
}
