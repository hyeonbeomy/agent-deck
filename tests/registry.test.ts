import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRegistryFile } from "../src/registry";

const sample = JSON.stringify({
	pid: 46756,
	sessionId: "98c49c72-0fc4-4cd5-8e9e-09b8da10a877",
	cwd: "C:\\Users\\User\\Downloads\\agent-deck",
	startedAt: 1793942486491,
	version: "2.1.316",
	kind: "interactive",
	entrypoint: "cli",
	name: "agent-deck-78",
	status: "busy",
	updatedAt: 1793942568295,
	statusUpdatedAt: 1793942568295
});

test("parseRegistryFile reads the fields the deck needs", () => {
	const e = parseRegistryFile("46756.json", sample);
	assert.deepEqual(e, {
		pid: 46756,
		sessionId: "98c49c72-0fc4-4cd5-8e9e-09b8da10a877",
		cwd: "C:\\Users\\User\\Downloads\\agent-deck",
		name: "agent-deck-78",
		status: "busy",
		statusUpdatedAt: 1793942568295,
		startedAt: 1793942486491
	});
});

test("parseRegistryFile ignores .key files, other extensions and broken JSON", () => {
	assert.equal(parseRegistryFile("46756.abc.key", '{"peerToken":"x"}'), undefined);
	assert.equal(parseRegistryFile("notes.txt", sample), undefined);
	assert.equal(parseRegistryFile("1.json", "{not json"), undefined);
	assert.equal(parseRegistryFile("1.json", "[]"), undefined);
});

test("parseRegistryFile skips sessions that are not interactive and needs pid + sessionId", () => {
	const headless = JSON.parse(sample);
	headless.kind = "print";
	assert.equal(parseRegistryFile("1.json", JSON.stringify(headless)), undefined);
	const noKind = JSON.parse(sample);
	delete noKind.kind;
	assert.ok(parseRegistryFile("1.json", JSON.stringify(noKind)));
	const noPid = JSON.parse(sample);
	delete noPid.pid;
	assert.equal(parseRegistryFile("1.json", JSON.stringify(noPid)), undefined);
	const noSid = JSON.parse(sample);
	delete noSid.sessionId;
	assert.equal(parseRegistryFile("1.json", JSON.stringify(noSid)), undefined);
});

test("parseRegistryFile keeps unknown status values and defaults timestamps", () => {
	const odd = JSON.parse(sample);
	odd.status = "ended";
	delete odd.statusUpdatedAt;
	delete odd.startedAt;
	const e = parseRegistryFile("1.json", JSON.stringify(odd));
	assert.equal(e?.status, "ended");
	assert.equal(e?.statusUpdatedAt, 0);
	assert.equal(e?.startedAt, 0);
});
