import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { resolveFocusKey, startServer } from "../src/server";
import { SessionStore } from "../src/sessions";

const silent = { info() {}, warn() {}, debug() {} };

function seededStore(): SessionStore {
	const store = new SessionStore();
	store.syncRegistry([
		{ pid: 4242, sessionId: "abc", cwd: "C:/work/proj", status: "idle", statusUpdatedAt: 1, startedAt: 1 },
		{ pid: 4343, sessionId: "def", cwd: "C:/work/other", status: "busy", statusUpdatedAt: 1, startedAt: 2 }
	]);
	return store;
}

test("resolveFocusKey finds a session by key, pid or label", () => {
	const store = seededStore();
	assert.equal(resolveFocusKey(store, { key: "claude:abc" }), "claude:abc");
	assert.equal(resolveFocusKey(store, { pid: 4343 }), "claude:def");
	assert.equal(resolveFocusKey(store, { label: "PROJ" }), "claude:abc");
	assert.equal(resolveFocusKey(store, { key: "claude:nope" }), undefined);
	assert.equal(resolveFocusKey(store, {}), undefined);
});

let server: ReturnType<typeof startServer>;
let base: string;
const focused: string[] = [];

before(async () => {
	server = startServer(seededStore(), "127.0.0.1", 0, silent, {
		focus: async (key) => {
			focused.push(key);
			return { ok: true, code: 0, detail: "", ms: 7 };
		}
	});
	await once(server, "listening");
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

test("POST /focus runs the focus hook for the session and returns its result", async () => {
	const res = await fetch(`${base}/focus`, { method: "POST", body: JSON.stringify({ pid: 4242 }) });
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { key: "claude:abc", ok: true, code: 0, detail: "", ms: 7 });
	assert.deepEqual(focused, ["claude:abc"]);
});

test("POST /focus answers 404 with the known sessions when nothing matches", async () => {
	const res = await fetch(`${base}/focus`, { method: "POST", body: JSON.stringify({ label: "missing" }) });
	assert.equal(res.status, 404);
	const body = (await res.json()) as { error: string; sessions: { key: string }[] };
	assert.equal(body.error, "no such session");
	assert.equal(body.sessions.length, 2);
});

test("POST /focus rejects a non-JSON body", async () => {
	const res = await fetch(`${base}/focus`, { method: "POST", body: "not json" });
	assert.equal(res.status, 400);
});

test("GET /health and /state still answer", async () => {
	assert.deepEqual(await (await fetch(`${base}/health`)).json(), { ok: true });
	const state = (await (await fetch(`${base}/state`)).json()) as { key: string }[];
	assert.equal(state.length, 2);
});
