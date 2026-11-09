import { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";

import { type ClaudeHereSettings, startClaudeHere } from "../claude-here";
import { renderClaudeHere } from "../render";

type Logger = { info(...a: unknown[]): void; warn(...a: unknown[]): void; debug(...a: unknown[]): void };

/**
 * Starts Claude Code in the folder of the focused Explorer window: a new Windows Terminal tab
 * runs WSL in that folder and launches `claude`. Falls back to the folder under the mouse
 * cursor, the desktop, the configured default folder, then the user's home. Drives and network
 * shares WSL has not mounted (NAS, Google Drive) are mounted first.
 */
@action({ UUID: "com.hbyi.agentdeck.claudehere" })
export class ClaudeHere extends SingletonAction<ClaudeHereSettings> {
	constructor(private readonly log: Logger) {
		super();
	}

	override async onWillAppear(ev: WillAppearEvent<ClaudeHereSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		try {
			await ev.action.setImage(renderClaudeHere());
		} catch (err) {
			this.log.warn(`setImage failed: ${String(err)}`);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<ClaudeHereSettings>): Promise<void> {
		const r = await startClaudeHere(ev.payload.settings);
		if (r.ok) {
			this.log.info(`claude started: ${r.detail || "ok"} (${r.ms} ms)`);
			await ev.action.showOk();
		} else {
			this.log.warn(`could not start claude here: exit ${r.code ?? "-"} after ${r.ms} ms ${r.detail}`.trim());
			await ev.action.showAlert();
		}
	}
}
