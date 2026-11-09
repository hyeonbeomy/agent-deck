import type { Action, KeyAction, SingletonAction } from "@elgato/streamdeck";

import { TICK_MS } from "./config";
import { type FocusResult, focusSession } from "./focus";
import { renderSlot, renderWaiting } from "./render";
import type { Session, SessionStore } from "./sessions";

type Logger = { info(...a: unknown[]): void; warn(...a: unknown[]): void; debug(...a: unknown[]): void };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySingleton = SingletonAction<any>;

const PRUNE_EVERY_TICKS = Math.round((60 * 1000) / TICK_MS);
const AUTOSLEEP_EVERY_TICKS = Math.round((10 * 1000) / TICK_MS);

function labelMatches(label: string, pin: string): boolean {
	const l = label.toLowerCase();
	const p = pin.toLowerCase();
	return l === p || l.includes(p);
}

function keyOrder(a: KeyAction<any>, b: KeyAction<any>): number {
	const ca = a.coordinates ?? { row: 99, column: 99 };
	const cb = b.coordinates ?? { row: 99, column: 99 };
	return a.device.id.localeCompare(b.device.id) || ca.row - cb.row || ca.column - cb.column;
}

/**
 * Glue between the session store and the keys: decides which session each key shows,
 * draws the keys, and handles presses.
 */
export class Deck {
	readonly #pins = new Map<string, string>();
	readonly #images = new Map<string, string>();
	readonly #assignment = new Map<string, string | undefined>();
	#slot?: AnySingleton;
	#next?: AnySingleton;
	#scheduled?: NodeJS.Timeout;
	/** Counts TICK_MS intervals; drives mascot frames and the attention pulse. */
	#ticks = 0;

	constructor(
		private readonly store: SessionStore,
		private readonly log: Logger
	) {
		store.on("change", () => this.schedule());
		setInterval(() => this.#tick(), TICK_MS).unref();
	}

	attach(slot: AnySingleton, next: AnySingleton): void {
		this.#slot = slot;
		this.#next = next;
	}

	/** A key (re)appeared on the device: forget its cached image so it is redrawn. */
	keyAppeared(actionId: string, pin?: string): void {
		this.#images.delete(actionId);
		this.setPin(actionId, pin);
	}

	setPin(actionId: string, pin?: string): void {
		const p = pin?.trim();
		if (p) this.#pins.set(actionId, p);
		else this.#pins.delete(actionId);
		this.schedule();
	}

	/** Coalesce bursts of changes (a tool call fires several hooks) into one redraw. */
	schedule(): void {
		if (this.#scheduled) return;
		this.#scheduled = setTimeout(() => {
			this.#scheduled = undefined;
			void this.render();
		}, 30);
	}

	async pressSlot(action: Action<any>): Promise<void> {
		const key = this.#assignment.get(action.id);
		const s = key ? this.store.get(key) : undefined;
		if (!s) return;
		await this.#jump(s, action);
	}

	async pressNext(action: Action<any>): Promise<void> {
		const s = this.store.waiting()[0];
		if (!s) {
			if (action.isKey()) await action.showOk();
			return;
		}
		await this.#jump(s, action);
	}

	/** Same as pressing the session's key, driven over HTTP (POST /focus); undefined for an unknown key. */
	async focusKey(key: string): Promise<FocusResult | undefined> {
		const s = this.store.get(key);
		if (!s) return undefined;
		return this.#jump(s);
	}

	async render(): Promise<void> {
		const now = Date.now();
		const keys = this.#slotKeys();
		this.#assign(keys);

		const tasks: Promise<void>[] = [];
		for (const k of keys) {
			const sessionKey = this.#assignment.get(k.id);
			const s = sessionKey ? this.store.get(sessionKey) : undefined;
			tasks.push(this.#draw(k, renderSlot(s, now, this.#ticks, this.#pins.get(k.id))));
		}
		if (this.#next) {
			const img = renderWaiting(this.store.waiting(), Math.floor(this.#ticks / 2) % 2 === 0);
			for (const a of this.#next.actions) if (a.isKey()) tasks.push(this.#draw(a, img));
		}
		await Promise.allSettled(tasks);
	}

	async #jump(s: Session, action?: Action<any>): Promise<FocusResult> {
		const r = await focusSession(s);
		this.store.markSeen(s.key);
		if (r.ok) {
			this.log.info(`focused ${s.label} (${s.token ?? `pid ${s.pid}`}) in ${r.ms} ms`);
		} else {
			this.log.warn(`could not focus ${s.label} (${s.token ?? `pid ${s.pid}`}): exit ${r.code ?? "-"} after ${r.ms} ms ${r.detail}`);
			if (action?.isKey()) await action.showAlert();
		}
		return r;
	}

	#slotKeys(): KeyAction<any>[] {
		if (!this.#slot) return [];
		const keys: KeyAction<any>[] = [];
		for (const a of this.#slot.actions) if (a.isKey() && !a.isInMultiAction()) keys.push(a);
		return keys.sort(keyOrder);
	}

	/** Pinned keys take their project first; the rest fill unpinned keys in the order sessions appeared. */
	#assign(keys: KeyAction<any>[]): void {
		this.#assignment.clear();
		const sessions = this.store.list();
		const used = new Set<string>();

		for (const k of keys) {
			const pin = this.#pins.get(k.id);
			if (!pin) continue;
			const match = sessions
				.filter((s) => !used.has(s.key) && labelMatches(s.label, pin))
				.sort((a, b) => b.lastEventAt - a.lastEventAt)[0];
			this.#assignment.set(k.id, match?.key);
			if (match) used.add(match.key);
		}

		const pool = sessions.filter((s) => !used.has(s.key));
		let i = 0;
		for (const k of keys) {
			if (this.#pins.has(k.id)) continue;
			this.#assignment.set(k.id, pool[i++]?.key);
		}
		if (i < pool.length) this.log.debug(`${pool.length - i} session(s) have no free key`);
	}

	async #draw(action: KeyAction<any>, image: string): Promise<void> {
		if (this.#images.get(action.id) === image) return;
		this.#images.set(action.id, image);
		try {
			await action.setImage(image);
		} catch (err) {
			this.#images.delete(action.id);
			this.log.warn(`setImage failed: ${String(err)}`);
		}
	}

	#tick(): void {
		this.#ticks++;
		if (this.#ticks % PRUNE_EVERY_TICKS === 0) this.store.prune();
		if (this.#ticks % AUTOSLEEP_EVERY_TICKS === 0) this.store.autoSleep();
		// Every session animates (typing, sleeping, waving), so redraw while any exists.
		// Unchanged images are not resent to the device.
		if (this.store.list().length > 0) void this.render();
	}
}
