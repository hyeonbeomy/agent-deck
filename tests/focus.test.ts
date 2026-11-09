import assert from "node:assert/strict";
import { test } from "node:test";

import { focusArgs } from "../src/focus";

const script = "C:/plugin/scripts/focus-window.ps1";

test("focusArgs passes token, pid and label in the script's search order", () => {
	const args = focusArgs({ token: "[cc:1a2b3c4d]", pid: 4242, label: "proj" }, script);
	assert.deepEqual(args, [
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		script,
		"-Match",
		"[cc:1a2b3c4d]",
		"-ProcessId",
		"4242",
		"-Fallback",
		"proj"
	]);
});

test("focusArgs omits what the session does not have (registry-only session: pid + label)", () => {
	const args = focusArgs({ pid: 4242, label: "proj" }, script);
	assert.ok(args);
	assert.ok(!args.includes("-Match"));
	assert.deepEqual(args.slice(-4), ["-ProcessId", "4242", "-Fallback", "proj"]);
});

test("focusArgs is undefined when there is nothing to search for", () => {
	assert.equal(focusArgs({ label: "" }, script), undefined);
});
