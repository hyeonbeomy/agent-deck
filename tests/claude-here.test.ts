import assert from "node:assert/strict";
import { test } from "node:test";

import { claudeHereArgs } from "../src/claude-here";

test("claudeHereArgs is empty when nothing is configured (a new terminal window is the default)", () => {
	assert.deepEqual(claudeHereArgs(undefined), []);
	assert.deepEqual(claudeHereArgs({}), []);
	assert.deepEqual(claudeHereArgs({ defaultFolder: "   ", tab: false, keepShell: false }), []);
});

test("claudeHereArgs passes trimmed text settings as named parameters and booleans as switches", () => {
	assert.deepEqual(
		claudeHereArgs({ defaultFolder: " C:/work ", distro: "Ubuntu", profile: "Ubuntu", tab: true, keepShell: true }),
		["-DefaultFolder", "C:/work", "-Distro", "Ubuntu", "-TerminalProfile", "Ubuntu", "-Tab", "-KeepShell"]
	);
});

test("claudeHereArgs ignores the newWindow setting saved by 0.3.0, where a tab was the default", () => {
	assert.deepEqual(claudeHereArgs({ newWindow: true } as never), []);
});
