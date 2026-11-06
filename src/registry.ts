import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { REGISTRY_POLL_MS } from "./config";
import type { SessionStore } from "./sessions";

/**
 * Claude Code (2.1.119+) writes one `<pid>.json` per running session to ~/.claude/sessions.
 * Reading that folder finds native Windows sessions without any hook installed, and gives us the
 * process id used to bring the session's terminal to the front.
 */
export interface RegistryEntry {
	pid: number;
	sessionId: string;
	cwd?: string;
	/** Claude Code's own short session name (e.g. "agent-deck-78"). */
	name?: string;
	/** "busy" | "idle" | "waiting" as written by Claude Code; unknown values are kept as-is. */
	status: string;
	statusUpdatedAt: number;
	startedAt: number;
}

type Logger = { info(...a: unknown[]): void; warn(...a: unknown[]): void; debug(...a: unknown[]): void };

export function registryDir(): string {
	const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
	return path.join(base, "sessions");
}

/** Parse one registry file. Returns undefined for anything that is not an interactive session. */
export function parseRegistryFile(fileName: string, text: string): RegistryEntry | undefined {
	if (!fileName.endsWith(".json")) return undefined;
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
	const d = data as Record<string, unknown>;

	const pid = d.pid;
	const sessionId = d.sessionId;
	if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return undefined;
	if (typeof sessionId !== "string" || sessionId.length === 0) return undefined;
	// Headless (-p) and SDK sessions have no terminal to jump to and no turn-taking to show.
	if (typeof d.kind === "string" && d.kind !== "interactive") return undefined;

	return {
		pid,
		sessionId,
		cwd: typeof d.cwd === "string" && d.cwd ? d.cwd : undefined,
		name: typeof d.name === "string" && d.name ? d.name : undefined,
		status: typeof d.status === "string" ? d.status : "",
		statusUpdatedAt: typeof d.statusUpdatedAt === "number" ? d.statusUpdatedAt : 0,
		startedAt: typeof d.startedAt === "number" ? d.startedAt : 0
	};
}

/** Registry files survive crashes, so every entry is checked against a live process. */
export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

export interface RegistryWatcherOptions {
	dir?: string;
	pollMs?: number;
	alive?: (pid: number) => boolean;
}

/** Polls the registry folder and feeds the live entries into the session store. */
export class RegistryWatcher {
	#timer?: NodeJS.Timeout;
	/** Last good parse per file, so a file caught mid-write doesn't make its session blink. */
	readonly #known = new Map<string, RegistryEntry>();

	constructor(
		private readonly store: SessionStore,
		private readonly log: Logger,
		private readonly opts: RegistryWatcherOptions = {}
	) {}

	get dir(): string {
		return this.opts.dir ?? registryDir();
	}

	start(): void {
		if (this.#timer) return;
		this.log.info(`watching ${this.dir}`);
		this.poll();
		this.#timer = setInterval(() => this.poll(), this.opts.pollMs ?? REGISTRY_POLL_MS);
		this.#timer.unref();
	}

	stop(): void {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = undefined;
	}

	poll(): void {
		const dir = this.dir;
		let names: string[];
		try {
			names = fs.readdirSync(dir);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
				this.log.debug(`cannot read ${dir}: ${String(err)}`);
				return;
			}
			names = [];
		}

		const present = new Set<string>();
		const entries: RegistryEntry[] = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			present.add(name);
			let parsed: RegistryEntry | undefined;
			try {
				parsed = parseRegistryFile(name, fs.readFileSync(path.join(dir, name), "utf8"));
			} catch {
				parsed = undefined;
			}
			if (parsed) this.#known.set(name, parsed);
			const entry = parsed ?? this.#known.get(name);
			if (entry) entries.push(entry);
		}
		for (const name of this.#known.keys()) if (!present.has(name)) this.#known.delete(name);

		const alive = this.opts.alive ?? isProcessAlive;
		this.store.syncRegistry(entries.filter((e) => alive(e.pid)));
	}
}
