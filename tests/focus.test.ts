import assert from "node:assert/strict";
import { test } from "node:test";

import { focusArgs } from "../src/focus";

test("focusArgs passes token, pid and label in the script's search order", () => {
	assert.deepEqual(focusArgs({ token: "[cc:1a2b3c4d]", pid: 4242, label: "proj" }), [
		"-Match",
		"[cc:1a2b3c4d]",
		"-ProcessId",
		"4242",
		"-Fallback",
		"proj"
	]);
});

test("focusArgs omits what the session does not have (registry-only session: pid + label)", () => {
	assert.deepEqual(focusArgs({ pid: 4242, label: "proj" }), ["-ProcessId", "4242", "-Fallback", "proj"]);
});

test("focusArgs is undefined when there is nothing to search for", () => {
	assert.equal(focusArgs({ label: "" }), undefined);
});
