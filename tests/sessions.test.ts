import assert from "node:assert/strict";
import { test } from "node:test";

import { DONE_TO_SLEEP_MS } from "../src/config";
import type { RegistryEntry } from "../src/registry";
import { SessionStore } from "../src/sessions";

function entry(over: Partial<RegistryEntry> = {}): RegistryEntry {
	return {
		pid: 100,
		sessionId: "s1",
		cwd: "C:\\work\\proj",
		name: "proj-1",
		status: "busy",
		statusUpdatedAt: 1000,
		startedAt: 500,
		...over
	};
}

function claudeHook(store: SessionStore, event: string, ts: number, extra: Record<string, unknown> = {}): void {
	store.applyClaude({ hook_event_name: event, session_id: "s1", cwd: "/home/u/proj", deck: { ts, label: "hooked" }, ...extra });
}

test("registry: busy session appears as working with pid, label from cwd and real start time", () => {
	const store = new SessionStore(() => 2000);
	store.syncRegistry([entry()]);
	const s = store.get("claude:s1");
	assert.ok(s);
	assert.equal(s.state, "working");
	assert.equal(s.pid, 100);
	assert.equal(s.label, "proj");
	assert.equal(s.startedAt, 500);
});

test("registry: waiting becomes attention of kind input", () => {
	const store = new SessionStore(() => 2000);
	store.syncRegistry([entry({ status: "waiting" })]);
	const s = store.get("claude:s1");
	assert.equal(s?.state, "attention");
	assert.equal(s?.attentionKind, "input");
});

test("registry: idle after working is done, idle on a fresh session is ready", () => {
	const store = new SessionStore(() => 2000);
	store.syncRegistry([entry({ status: "idle" })]);
	assert.equal(store.get("claude:s1")?.state, "ready");
	store.syncRegistry([entry({ status: "busy", statusUpdatedAt: 1100 })]);
	assert.equal(store.get("claude:s1")?.state, "working");
	store.syncRegistry([entry({ status: "idle", statusUpdatedAt: 1200 })]);
	assert.equal(store.get("claude:s1")?.state, "done");
	assert.equal(store.get("claude:s1")?.seen, false);
});

test("registry: repeating the same status does not reset seen", () => {
	const store = new SessionStore(() => 2000);
	store.syncRegistry([entry({ status: "busy" })]);
	store.syncRegistry([entry({ status: "idle", statusUpdatedAt: 1200 })]);
	store.markSeen("claude:s1");
	store.syncRegistry([entry({ status: "idle", statusUpdatedAt: 1200 })]);
	store.syncRegistry([entry({ status: "idle", statusUpdatedAt: 1300 })]);
	assert.equal(store.get("claude:s1")?.seen, true);
});

test("registry: a newer hook event wins over an older registry status", () => {
	const store = new SessionStore(() => 2000);
	claudeHook(store, "UserPromptSubmit", 4000);
	claudeHook(store, "Stop", 5000);
	store.syncRegistry([entry({ status: "busy", statusUpdatedAt: 4500 })]);
	assert.equal(store.get("claude:s1")?.state, "done");
	store.syncRegistry([entry({ status: "busy", statusUpdatedAt: 6000 })]);
	assert.equal(store.get("claude:s1")?.state, "working");
});

test("registry: attention kind from the hook survives a registry waiting status", () => {
	const store = new SessionStore(() => 2000);
	claudeHook(store, "PermissionRequest", 4000, { tool_name: "Bash" });
	store.syncRegistry([entry({ status: "waiting", statusUpdatedAt: 4100 })]);
	const s = store.get("claude:s1");
	assert.equal(s?.state, "attention");
	assert.equal(s?.attentionKind, "permission");
});

test("registry: error is not replaced by idle", () => {
	const store = new SessionStore(() => 2000);
	claudeHook(store, "StopFailure", 4000, { error_type: "rate_limit" });
	store.syncRegistry([entry({ status: "idle", statusUpdatedAt: 4100 })]);
	assert.equal(store.get("claude:s1")?.state, "error");
});

test("registry: sessions that leave the registry are removed, hook-only sessions stay", () => {
	const store = new SessionStore(() => 2000);
	store.syncRegistry([entry(), entry({ pid: 101, sessionId: "s2" })]);
	store.applyClaude({ hook_event_name: "SessionStart", session_id: "wsl-only", cwd: "/home/u/x", deck: { ts: 3000 } });
	store.syncRegistry([entry({ pid: 101, sessionId: "s2" })]);
	assert.deepEqual(
		store.list().map((s) => s.key),
		["claude:s2", "claude:wsl-only"]
	);
});

test("registry: does not overwrite a label set by the hook", () => {
	const store = new SessionStore(() => 2000);
	claudeHook(store, "SessionStart", 3000);
	store.syncRegistry([entry({ status: "idle", statusUpdatedAt: 1000 })]);
	assert.equal(store.get("claude:s1")?.label, "hooked");
	assert.equal(store.get("claude:s1")?.pid, 100);
});

test("registry: a session ended by the hook is not resurrected by a lingering file", () => {
	const store = new SessionStore(() => 2000);
	store.syncRegistry([entry()]);
	store.applyClaude({ hook_event_name: "SessionEnd", session_id: "s1", deck: { ts: 3000 } });
	store.syncRegistry([entry()]);
	assert.equal(store.get("claude:s1"), undefined);
});

test("autoSleep: a finished session nobody looked at falls asleep after DONE_TO_SLEEP_MS", () => {
	let now = 10_000;
	const store = new SessionStore(() => now);
	store.syncRegistry([entry({ status: "busy" })]);
	store.syncRegistry([entry({ status: "idle", statusUpdatedAt: 1200 })]);
	now += DONE_TO_SLEEP_MS - 1;
	store.autoSleep();
	assert.equal(store.get("claude:s1")?.seen, false);
	now += 2;
	store.autoSleep();
	assert.equal(store.get("claude:s1")?.seen, true);
});
