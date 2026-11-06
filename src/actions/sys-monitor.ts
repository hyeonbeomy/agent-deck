import { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";
import { spawn } from "node:child_process";

import { SYSMON_SAMPLE_MS } from "../config";
import { renderSysMonitor } from "../render";
import { SystemSampler } from "../sysmon";

type Logger = { info(...a: unknown[]): void; warn(...a: unknown[]): void; debug(...a: unknown[]): void };

/** Launch the OS task monitor; resolves false if it could not be started. */
function openTaskMonitor(): Promise<boolean> {
	return new Promise((resolve) => {
		const cmd =
			process.platform === "win32"
				? spawn("taskmgr.exe", [], { detached: true, stdio: "ignore" })
				: process.platform === "darwin"
					? spawn("open", ["-a", "Activity Monitor"], { detached: true, stdio: "ignore" })
					: undefined;
		if (!cmd) return resolve(false);
		cmd.once("error", () => resolve(false));
		cmd.once("spawn", () => {
			cmd.unref();
			resolve(true);
		});
	});
}

/**
 * CPU / RAM usage on one key, refreshed every second while at least one such key is visible.
 * Press to open Task Manager (Activity Monitor on macOS).
 */
@action({ UUID: "com.hbyi.agentdeck.sysmon" })
export class SysMonitor extends SingletonAction {
	readonly #sampler = new SystemSampler();
	readonly #images = new Map<string, string>();
	#timer?: NodeJS.Timeout;

	constructor(private readonly log: Logger) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		this.#images.delete(ev.action.id);
		if (!this.#timer) {
			this.#timer = setInterval(() => void this.#draw(), SYSMON_SAMPLE_MS);
			this.#timer.unref();
		}
		void this.#draw();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		if (!(await openTaskMonitor())) {
			this.log.warn("could not open the task monitor");
			await ev.action.showAlert();
		}
	}

	async #draw(): Promise<void> {
		const keys = [...this.actions].filter((a) => a.isKey());
		if (keys.length === 0) {
			// Last key left the device: stop sampling until one comes back.
			if (this.#timer) clearInterval(this.#timer);
			this.#timer = undefined;
			return;
		}
		const image = renderSysMonitor(this.#sampler.sample(), this.#sampler.historyLength);
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
