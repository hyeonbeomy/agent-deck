import http from "node:http";

import type { SessionStore } from "./sessions";

const MAX_BODY = 16 * 1024 * 1024;

type Logger = { info(...a: unknown[]): void; warn(...a: unknown[]): void; debug(...a: unknown[]): void };

/**
 * Tiny localhost HTTP server the hook scripts post to.
 *   POST /claude  body = Claude Code hook payload (+ optional "deck" object from the WSL hook)
 *   POST /codex   body = Codex notify payload
 *   GET  /state   current sessions, for debugging
 */
export function startServer(store: SessionStore, host: string, port: number, log: Logger): http.Server {
	const server = http.createServer((req, res) => {
		const url = req.url?.split("?")[0] ?? "/";

		if (req.method === "GET" && (url === "/state" || url === "/health")) {
			res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
			res.end(JSON.stringify(url === "/health" ? { ok: true } : store.list(), null, 2));
			return;
		}

		if (req.method !== "POST" || (url !== "/claude" && url !== "/codex")) {
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

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") log.warn(`port ${port} is already in use; hooks cannot reach the plugin`);
		else log.warn(`server error: ${err.message}`);
	});
	server.listen(port, host, () => log.info(`listening on http://${host}:${port}`));
	return server;
}
