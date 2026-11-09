import http from "node:http";

import type { SessionStore } from "./sessions";

const MAX_BODY = 16 * 1024 * 1024;

type Logger = { info(...a: unknown[]): void; warn(...a: unknown[]): void; debug(...a: unknown[]): void };

export type ServerHooks = {
	/** Focus the terminal of a session (store key); resolves to the focus result. */
	focus?: (key: string) => Promise<unknown>;
};

type FocusRequest = { key?: unknown; pid?: unknown; label?: unknown };

/** Store key for a /focus request: by key, else by pid, else by label (first match). */
export function resolveFocusKey(store: SessionStore, body: FocusRequest): string | undefined {
	if (typeof body.key === "string" && store.get(body.key)) return body.key;
	if (typeof body.pid === "number") return store.list().find((s) => s.pid === body.pid)?.key;
	if (typeof body.label === "string") {
		const label = body.label.toLowerCase();
		return store.list().find((s) => s.label.toLowerCase() === label)?.key;
	}
	return undefined;
}

/**
 * Tiny localhost HTTP server the hook scripts post to.
 *   POST /claude  body = Claude Code hook payload (+ optional "deck" object from the WSL hook)
 *   POST /codex   body = Codex notify payload
 *   POST /focus   body = {"key": "claude:<id>"} | {"pid": 1234} | {"label": "project"}; focuses
 *                 that session's terminal exactly like a key press and returns the result (debugging)
 *   GET  /state   current sessions, for debugging
 */
export function startServer(store: SessionStore, host: string, port: number, log: Logger, hooks: ServerHooks = {}): http.Server {
	const server = http.createServer((req, res) => {
		const url = req.url?.split("?")[0] ?? "/";

		if (req.method === "GET" && (url === "/state" || url === "/health")) {
			res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
			res.end(JSON.stringify(url === "/health" ? { ok: true } : store.list(), null, 2));
			return;
		}

		if (req.method !== "POST" || (url !== "/claude" && url !== "/codex" && url !== "/focus")) {
			res.writeHead(404).end();
			return;
		}

		const chunks: Buffer[] = [];
		let size = 0;
		let tooBig = false;
		req.on("data", (c: Buffer) => {
			size += c.length;
			if (size > MAX_BODY) tooBig = true;
			else chunks.push(c);
		});
		req.on("end", () => {
			if (url === "/focus") {
				void handleFocus(Buffer.concat(chunks).toString("utf8"), res);
				return;
			}
			// Answer right away; the hook doesn't wait for anything.
			res.writeHead(tooBig ? 413 : 204).end();
			if (tooBig) {
				log.debug(`dropped oversized ${url} payload (${size} bytes)`);
				return;
			}
			try {
				const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
				if (typeof payload !== "object" || payload === null) return;
				if (url === "/claude") store.applyClaude(payload);
				else store.applyCodex(payload);
			} catch (err) {
				log.warn(`bad ${url} payload: ${String(err)}`);
			}
		});
		req.on("error", () => res.destroy());
	});

	async function handleFocus(text: string, res: http.ServerResponse): Promise<void> {
		const json = (status: number, body: unknown): void => {
			res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
			res.end(JSON.stringify(body, null, 2));
		};
		if (!hooks.focus) {
			json(501, { error: "focus is not available" });
			return;
		}
		let body: FocusRequest;
		try {
			const parsed: unknown = text ? JSON.parse(text) : {};
			if (typeof parsed !== "object" || parsed === null) throw new Error("body must be a JSON object");
			body = parsed as FocusRequest;
		} catch (err) {
			json(400, { error: String(err) });
			return;
		}
		const key = resolveFocusKey(store, body);
		if (!key) {
			json(404, { error: "no such session", sessions: store.list().map((s) => ({ key: s.key, pid: s.pid, label: s.label })) });
			return;
		}
		try {
			json(200, { key, ...((await hooks.focus(key)) as object) });
		} catch (err) {
			json(500, { key, error: String(err) });
		}
	}

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") log.warn(`port ${port} is already in use; hooks cannot reach the plugin`);
		else log.warn(`server error: ${err.message}`);
	});
	server.listen(port, host, () => log.info(`listening on http://${host}:${port}`));
	return server;
}
