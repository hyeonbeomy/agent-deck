import { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";

import type { Deck } from "../deck";

/**
 * Shows how many sessions are waiting on you (approval, question, finished turn).
 * Press to jump to the most urgent one. Handy when there are more sessions than keys.
 */
@action({ UUID: "com.hbyi.agentdeck.next" })
export class NextWaiting extends SingletonAction {
	constructor(private readonly deck: Deck) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		this.deck.keyAppeared(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await this.deck.pressNext(ev.action);
	}
}
