import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// bin/plugin.js -> <plugin>.sdPlugin
const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type ScriptResult = {
	/** True when the script exited with 0. */
	ok: boolean;
	/** Exit code (0 success, 1 target not found, 2 found but Windows refused); null when the script did not run. */
	code: number | null;
	/** Script output: stdout on success, stderr (or the spawn error) on failure. Trimmed. */
	detail: string;
	/** Wall time of the run. */
	ms: number;
};

/** Absolute path of one of the plugin's helper scripts (<plugin>.sdPlugin/scripts/<name>). */
export function scriptPath(name: string): string {
	return path.join(pluginDir, "scripts", name);
}

/** powershell.exe arguments: no profile, no prompts, run the file, then the script's own parameters. */
export function powershellArgs(script: string, args: string[] = []): string[] {
	return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, ...args];
}

/** Run one of the plugin's PowerShell helpers. Never rejects; failures are reported in the result. */
export function runScript(name: string, args: string[] = [], timeoutMs = 15000): Promise<ScriptResult> {
	const started = Date.now();
	const result = (ok: boolean, code: number | null, detail = ""): ScriptResult => ({
		ok,
		code,
		detail: detail.trim().slice(0, 400),
		ms: Date.now() - started
	});

	if (process.platform !== "win32") {
		return Promise.resolve(result(false, null, "the PowerShell helpers only run on Windows"));
	}
	return new Promise((resolve) => {
		execFile("powershell.exe", powershellArgs(scriptPath(name), args), { windowsHide: true, timeout: timeoutMs }, (err, stdout, stderr) => {
			if (!err) {
				resolve(result(true, 0, stdout));
				return;
			}
			const code = typeof err.code === "number" ? err.code : null;
			const detail = err.killed ? `timed out after ${timeoutMs} ms` : stderr || stdout || err.message;
			resolve(result(false, code, detail));
		});
	});
}
