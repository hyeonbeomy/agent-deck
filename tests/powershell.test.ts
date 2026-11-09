import assert from "node:assert/strict";
import { test } from "node:test";

import { powershellArgs, scriptPath } from "../src/powershell";

test("powershellArgs runs the script file without profile or prompts and appends the script's own arguments", () => {
	assert.deepEqual(powershellArgs("C:/p/scripts/x.ps1", ["-Flag", "value"]), [
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		"C:/p/scripts/x.ps1",
		"-Flag",
		"value"
	]);
});

test("powershellArgs with no script arguments ends at the script path", () => {
	assert.deepEqual(powershellArgs("x.ps1").slice(-2), ["-File", "x.ps1"]);
});

test("scriptPath points at a file in the plugin's scripts folder", () => {
	assert.match(scriptPath("claude-here.ps1").replace(/\\/g, "/"), /\/scripts\/claude-here\.ps1$/);
});
