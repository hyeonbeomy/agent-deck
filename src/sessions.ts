import { EventEmitter } from "node:events";

import { DONE_TO_SLEEP_MS, STALE_AFTER_MS } from "./config";
import type { RegistryEntry } from "./registry";

export type Source = "claude" | "codex";
export type State = "ready" | "working" | "attention" | "done" | "error";
/** permission = tool approval, question = AskUserQuestion, input = registry only says "waiting". */
export type AttentionKind = "permission" | "question" | "input";

export interface Session {
	/** `${source}:${id}` */
	key: string;
	source: Source;
	id: string;
	/** Project name shown on the key (folder name of the project by default). */
	label: string;
	/** Unique marker the hook writes into the terminal title, used to find the window. */
	token?: string;
	cwd?: string;
	/** Process id of the agent (from the session registry); used to find its terminal window. */
	pid?: number;
	state: State;
	attentionKind?: AttentionKind;
	/** Extra info: tool name, error type, ... */
	detail?: string;
	/** True once the user jumped to a finished session, so the key can calm down. */
	seen: boolean;
	startedAt: number;
	stateSince: number;
	lastEventAt: number;
	/** Ordering timestamp from the hook; events older than this are stale and ignored. */
	lastHookTs: number;
	/** Last registry status applied, so a poll that reads the same thing again changes nothing. */
	registryStatus?: string;
	registryStatusAt?: number;
}

/** Extra fields the hook scripts add next to Claude Code's own payload. */
interface DeckMeta {
	token?: string;
	label?: string;
	ts?: number;
}

type Json = Record<string, unknown>;

const QUESTION_TOOLS = new Set(["AskUserQuestion"]);
const QUESTION_NOTIFICATIONS = new Set(["elicitation_dialog", "elicitation_url_dialog", "agent_needs_input"]);
const TOMBSTONE_MS = 10 * 60 * 1000;

export function baseName(p: string | undefined): string {
	if (!p) return "";
	const parts = p.replace(/[\\/]+$/, "").split(/[\\/]/);
	return parts[parts.length - 1] || p;
}

function str(v: unknown): string | undefined {
	return typeof v === "string" && v.length > 0 ? v : undefined;
}

interface UpsertInfo {
	label?: string;
	/** Used only when the session is new; never overrides a label the hook chose. */
	labelIfNew?: string;
	token?: string;
	cwd?: string;
	pid?: number;
	startedAt?: number;
}

/**
 * Holds the live state of every known agent session and turns hook events / registry polls into
 * state changes. Emits "change" after every mutation.
 */
export class SessionStore extends EventEmitter {
	readonly #sessions = new Map<string, Session>();
	readonly #ended = new Map<string, number>();

	constructor(private readonly now: () => number = Date.now) {
		super();
	}

	/** Sessions ordered by when they first appeared (stable key positions). */
	list(): Session[] {
		return [...this.#sessions.values()].sort((a, b) => a.startedAt - b.startedAt || a.key.localeCompare(b.key));
	}

	get(key: string): Session | undefined {
		return this.#sessions.get(key);
	}

	/** Sessions that want the user, most urgent first: approvals/questions, then unseen finished turns, oldest first. */
	waiting(): Session[] {
		const rank = (s: Session) => (s.state === "attention" ? 0 : s.state === "error" ? 1 : 2);
		return this.list()
			.filter((s) => s.state === "attention" || s.state === "error" || (s.state === "done" && !s.seen))
			.sort((a, b) => rank(a) - rank(b) || a.stateSince - b.stateSince);
	}

	markSeen(key: string): void {
		const s = this.#sessions.get(key);
		if (s && (s.state === "done" || s.state === "error") && !s.seen) {
			s.seen = true;
			this.emit("change");
		}
	}

	remove(key: string): void {
		if (this.#sessions.delete(key)) {
			this.#ended.set(key, this.now());
			this.emit("change");
		}
	}

	/** Drop sessions that have been silent for a long time (closed terminals never send SessionEnd). */
	prune(): void {
		const now = this.now();
		let changed = false;
		for (const [key, s] of this.#sessions) {
			if (now - s.lastEventAt > STALE_AFTER_MS) {
				this.#sessions.delete(key);
				changed = true;
			}
		}
		for (const [key, t] of this.#ended) {
			if (now - t > TOMBSTONE_MS) this.#ended.delete(key);
		}
		if (changed) this.emit("change");
	}

	/** A finished turn nobody looked at for a long time stops asking for attention. */
	autoSleep(): void {
		const now = this.now();
		let changed = false;
		for (const s of this.#sessions.values()) {
			if (s.state === "done" && !s.seen && now - s.stateSince > DONE_TO_SLEEP_MS) {
				s.seen = true;
				changed = true;
			}
		}
		if (changed) this.emit("change");
	}

	/** Apply one Claude Code hook payload. Returns true if anything changed. */
	applyClaude(payload: Json): boolean {
		const event = str(payload.hook_event_name);
		const sessionId = str(payload.session_id);
		if (!event || !sessionId) return false;

		const meta = (typeof payload.deck === "object" && payload.deck !== null ? payload.deck : {}) as DeckMeta;
		const key = `claude:${sessionId}`;
		const ts = Number(meta.ts) || this.now();

		if (event === "SessionEnd") {
			this.remove(key);
			return true;
		}
		// Background (async) hooks can arrive after SessionEnd; don't resurrect the session.
		if (this.#ended.has(key)) return false;

		const s = this.#upsert(key, "claude", sessionId, {
			label: str(meta.label) ?? baseName(str(payload.cwd)),
			token: str(meta.token),
			cwd: str(payload.cwd)
		});

		// Async hooks may arrive out of order. Only the newest event decides the state.
		if (ts < s.lastHookTs) return false;
		s.lastHookTs = ts;

		const tool = str(payload.tool_name);
		switch (event) {
			case "SessionStart":
				this.#setState(s, "ready");
				break;
			case "UserPromptSubmit":
				this.#setState(s, "working");
				break;
			case "PreToolUse":
				if (tool && QUESTION_TOOLS.has(tool)) this.#setState(s, "attention", { kind: "question", detail: tool });
				else this.#setState(s, "working", { detail: tool });
				break;
			case "PostToolUse":
			case "PostToolUseFailure":
			case "PostToolBatch":
				this.#setState(s, "working", { detail: s.state === "working" ? s.detail : undefined });
				break;
			case "PermissionRequest":
				this.#setState(s, "attention", { kind: "permission", detail: tool });
				break;
			case "Notification": {
				const type = str(payload.notification_type) ?? "";
				if (type === "permission_prompt") this.#setState(s, "attention", { kind: "permission", detail: s.detail });
				else if (QUESTION_NOTIFICATIONS.has(type)) this.#setState(s, "attention", { kind: "question" });
				else if ((type === "idle_prompt" || type === "agent_completed") && s.state === "working") this.#setState(s, "done");
				break;
			}
			case "Stop":
				this.#setState(s, "done");
				break;
			case "StopFailure":
				this.#setState(s, "error", { detail: str(payload.error_type) ?? str(payload.error) });
				break;
			default:
				break;
		}
		this.emit("change");
		return true;
	}

	/** Apply one Codex `notify` payload. Returns true if anything changed. */
	applyCodex(payload: Json): boolean {
		const type = str(payload.type);
		if (!type) return false;
		const meta = (typeof payload.deck === "object" && payload.deck !== null ? payload.deck : {}) as DeckMeta;
		const cwd = str(payload.cwd);
		const id = str(payload["thread-id"]) ?? str(payload.thread_id) ?? cwd ?? "default";
		const key = `codex:${id}`;

		const s = this.#upsert(key, "codex", id, { label: str(meta.label) ?? baseName(cwd), cwd });
		if (type.includes("approval")) this.#setState(s, "attention", { kind: "permission" });
		else if (type === "agent-turn-complete") this.#setState(s, "done");
		else return false;
		this.emit("change");
		return true;
	}

	/**
	 * Reconcile with the live entries of ~/.claude/sessions. Sessions found there get their pid;
	 * their coarse status (busy / waiting / idle) is applied unless a newer hook event already
	 * said something more precise. Sessions that vanished from the registry are removed.
	 */
	syncRegistry(entries: RegistryEntry[]): void {
		const present = new Set<string>();
		let changed = false;

		for (const e of entries) {
			const key = `claude:${e.sessionId}`;
			if (this.#ended.has(key)) continue;
			present.add(key);

			const isNew = !this.#sessions.has(key);
			const s = this.#upsert(key, "claude", e.sessionId, {
				labelIfNew: baseName(e.cwd) || e.name,
				cwd: e.cwd,
				pid: e.pid,
				startedAt: e.startedAt
			});
			if (isNew) changed = true;

			if (s.registryStatus === e.status && s.registryStatusAt === e.statusUpdatedAt) continue;
			s.registryStatus = e.status;
			s.registryStatusAt = e.statusUpdatedAt;
			if (e.statusUpdatedAt < s.lastHookTs) continue;

			switch (e.status) {
				case "busy":
					this.#setState(s, "working", { detail: s.state === "working" ? s.detail : undefined });
					changed = true;
					break;
				case "waiting":
					if (s.state === "attention") this.#setState(s, "attention", { kind: s.attentionKind, detail: s.detail });
					else this.#setState(s, "attention", { kind: "input" });
					changed = true;
					break;
				case "idle":
					if (s.state === "working" || s.state === "attention") {
						this.#setState(s, "done");
						changed = true;
					}
					break;
				default:
					break;
			}
		}

		const now = this.now();
		for (const [key, s] of this.#sessions) {
			if (s.pid !== undefined && !present.has(key)) {
				this.#sessions.delete(key);
				this.#ended.set(key, now);
				changed = true;
			}
		}
		if (changed) this.emit("change");
	}

	#upsert(key: string, source: Source, id: string, info: UpsertInfo): Session {
		const now = this.now();
		let s = this.#sessions.get(key);
		if (!s) {
			s = {
				key,
				source,
				id,
				label: info.label || info.labelIfNew || id.slice(0, 8),
				token: info.token,
				cwd: info.cwd,
				pid: info.pid,
				state: "ready",
				seen: false,
				startedAt: info.startedAt || now,
				stateSince: now,
				lastEventAt: now,
				lastHookTs: 0
			};
			this.#sessions.set(key, s);
		} else {
			if (info.label) s.label = info.label;
			if (info.token) s.token = info.token;
			if (info.cwd) s.cwd = info.cwd;
			if (info.pid) s.pid = info.pid;
			s.lastEventAt = now;
		}
		return s;
	}

	#setState(s: Session, state: State, opts: { kind?: AttentionKind; detail?: string } = {}): void {
		if (s.state !== state) s.stateSince = this.now();
		s.state = state;
		s.attentionKind = state === "attention" ? opts.kind : undefined;
		s.detail = opts.detail;
		// Every new state is fresh news until the user jumps to the session.
		s.seen = false;
	}
}
