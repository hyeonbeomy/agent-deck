import assert from "node:assert/strict";
import { test } from "node:test";

import { ASYNC_EVENTS, mergeSettings, SYNC_EVENTS, TITLE_ENV } from "../hooks/windows/settings-merge.mjs";

const NODE = "C:/Program Files/nodejs/node.exe";
const HOOK = "C:/Users/me/.claude/agent-deck/agent-deck-hook.mjs";
const opts = { mode: "install", nodePath: NODE, hookPath: HOOK } as const;

/** Settings file of someone who already uses another hook-based tool. */
function existing() {
	return {
		model: "fable",
		hooks: {
			PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: '"C:/Other/app.exe" hook PreToolUse' }] }],
			Stop: [{ matcher: "*", hooks: [{ type: "command", command: '"C:/Other/app.exe" hook Stop' }] }]
		},
		env: { FOO: "bar" }
	};
}

function deckEntries(settings: any, event: string) {
	return (settings.hooks?.[event] ?? []).flatMap((g: any) => g.hooks).filter((h: any) => h.args?.[0] === HOOK);
}

test("install adds exec-form hooks for every event, sync ones with a timeout, async ones in the background", () => {
	const out = mergeSettings(undefined, opts);
	for (const event of SYNC_EVENTS) {
		const [h] = deckEntries(out, event);
		assert.deepEqual(h, { type: "command", command: NODE, args: [HOOK], timeout: 5 });
	}
	for (const event of ASYNC_EVENTS) {
		const [h] = deckEntries(out, event);
		assert.deepEqual(h, { type: "command", command: NODE, args: [HOOK], async: true });
	}
	assert.equal(out.env[TITLE_ENV], "1");
});

test("install keeps other tools' hooks, other settings and existing env", () => {
	const out = mergeSettings(existing(), opts);
	assert.equal(out.model, "fable");
	assert.equal(out.env.FOO, "bar");
	assert.equal(out.hooks.PreToolUse[0].hooks[0].command, '"C:/Other/app.exe" hook PreToolUse');
	assert.equal(out.hooks.Stop[0].hooks[0].command, '"C:/Other/app.exe" hook Stop');
	assert.equal(deckEntries(out, "PreToolUse").length, 1);
	assert.equal(deckEntries(out, "Stop").length, 1);
});

test("installing twice does not duplicate entries", () => {
	const once = mergeSettings(existing(), opts);
	const twice = mergeSettings(once, opts);
	assert.deepEqual(twice, once);
	for (const event of [...SYNC_EVENTS, ...ASYNC_EVENTS]) assert.equal(deckEntries(twice, event).length, 1);
});

test("install does not touch the original object", () => {
	const before = existing();
	mergeSettings(before, opts);
	assert.deepEqual(before, existing());
});

test("--keep-title leaves the terminal title env alone", () => {
	const out = mergeSettings(existing(), { ...opts, keepTitle: true });
	assert.equal(out.env[TITLE_ENV], undefined);
	assert.equal(out.env.FOO, "bar");
});

test("uninstall removes only Agent Deck entries and the env it added", () => {
	const installed = mergeSettings(existing(), opts);
	const out = mergeSettings(installed, { ...opts, mode: "uninstall" });
	assert.deepEqual(out, existing());
});

test("uninstall drops empty hooks/env objects and old shell-form entries", () => {
	const legacy = {
		hooks: {
			SessionStart: [{ hooks: [{ type: "command", command: `node "${HOOK}"`, timeout: 5 }] }]
		},
		env: { [TITLE_ENV]: "1" }
	};
	const out = mergeSettings(legacy, { ...opts, mode: "uninstall" });
	assert.deepEqual(out, {});
});
