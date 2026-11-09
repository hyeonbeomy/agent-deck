import { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { execFile } from "node:child_process";

import { parseTasklist, showClaudeApp, TASKLIST_ARGS } from "../claude-app";
import { CLAUDE_APP_POLL_MS } from "../config";
import { renderClaudeApp } from "../render";

type Logger = { info(...a: unknown[]): void; warn(...a: unknown[]): void; debug(...a: unknown[]): void };

/** Is the Claude desktop app's main process alive? (cheap: one tasklist call) */
function isClaudeAppRunning(): Promise<boolean> {
	if (process.platform !== "win32") return Promise.resolve(false);
	return new Promise((resolve) => {
		execFile("tasklist", [...TASKLIST_ARGS], { windowsHide: true, timeout: 5000 }, (err, stdout) => resolve(!err && parseTasklist(stdout)));
	});
}

/**
 * Brings the Claude desktop app to the front; starts it first when it is not running.
 * The key shows whether the app is running (polled while the key is visible).
 */
@action({ UUID: "com.hbyi.agentdeck.claudeapp" })
export class ClaudeApp extends SingletonAction {
	readonly #images = new Map<string, string>();
	#timer?: NodeJS.Timeout;

	constructor(private readonly log: Logger) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		this.#images.delete(ev.action.id);
		if (!this.#timer) {
			this.#timer = setInterval(() => void this.#refresh(), CLAUDE_APP_POLL_MS);
			this.#timer.unref();
		}
		void this.#refresh();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const r = await showClaudeApp();
		if (r.ok) {
			this.log.info(`Claude app to the front in ${r.ms} ms ${r.detail}`.trim());
			await ev.action.showOk();
		} else {
			this.log.warn(`could not bring up the Claude app: exit ${r.code ?? "-"} after ${r.ms} ms ${r.detail}`.trim());
			await ev.action.showAlert();
		}
		// The app may have just been started; refresh the status dot soon.
		setTimeout(() => void this.#refresh(), 1500).unref();
	}

	async #refresh(): Promise<void> {
		const keys = [...this.actions].filter((a) => a.isKey());
		if (keys.length === 0) {
			// Last key left the device: stop polling until one comes back.
			if (this.#timer) clearInterval(this.#timer);
			this.#timer = undefined;
			return;
		}
		const image = renderClaudeApp(await isClaudeAppRunning());
		await Promise.allSettled(
			keys.map(async (k) => {
				if (this.#images.get(k.id) === image) return;
				this.#images.set(k.id, image);
				try {
					await k.setImage(image);
				} catch (err) {
					this.#images.delete(k.id);
					this.log.warn(`setImage failed: ${String(err)}`);
				}
			})
		);
	}
}
