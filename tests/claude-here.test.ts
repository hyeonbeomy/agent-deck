import assert from "node:assert/strict";
import { test } from "node:test";

import { claudeHereArgs } from "../src/claude-here";

test("claudeHereArgs is empty when nothing is configured", () => {
	assert.deepEqual(claudeHereArgs(undefined), []);
	assert.deepEqual(claudeHereArgs({}), []);
	assert.deepEqual(claudeHereArgs({ defaultFolder: "   ", newWindow: false, keepShell: false }), []);
});

test("claudeHereArgs passes trimmed text settings as named parameters and booleans as switches", () => {
	assert.deepEqual(
		claudeHereArgs({ defaultFolder: " C:/work ", distro: "Ubuntu", profile: "Ubuntu", newWindow: true, keepShell: true }),
		["-DefaultFolder", "C:/work", "-Distro", "Ubuntu", "-TerminalProfile", "Ubuntu", "-NewWindow", "-KeepShell"]
	);
});
