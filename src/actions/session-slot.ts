import {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import type { Deck } from "../deck";

type SlotSettings = {
	/** Project name this key is pinned to; empty = auto-assigned. */
	pin?: string;
};

/**
 * One key = one agent session. Shows the session's live state; press to jump to its window.
 */
@action({ UUID: "com.hbyi.agentdeck.slot" })
export class SessionSlot extends SingletonAction<SlotSettings> {
	constructor(private readonly deck: Deck) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent<SlotSettings>): void {
		this.deck.keyAppeared(ev.action.id, ev.payload.settings.pin);
	}

	override onWillDisappear(_ev: WillDisappearEvent<SlotSettings>): void {
		this.deck.schedule();
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<SlotSettings>): void {
		this.deck.setPin(ev.action.id, ev.payload.settings.pin);
	}

	override async onKeyDown(ev: KeyDownEvent<SlotSettings>): Promise<void> {
		await this.deck.pressSlot(ev.action);
	}
}
