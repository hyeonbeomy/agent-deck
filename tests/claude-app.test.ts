import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTasklist, TASKLIST_ARGS } from "../src/claude-app";

test("parseTasklist reports running when tasklist prints a CSV process row", () => {
	assert.equal(parseTasklist('"claude.exe","25116","Console","1","228,624 K"\r\n'), true);
});

test("parseTasklist reports not running for the no-match notice in any language", () => {
	assert.equal(parseTasklist("INFO: No tasks are running which match the specified criteria.\r\n"), false);
	assert.equal(parseTasklist("정보: 지정된 조건과 일치하는 작업이 실행되고 있지 않습니다.\r\n"), false);
	assert.equal(parseTasklist(""), false);
});

test("TASKLIST_ARGS filters on the desktop app's main window title so the CLI claude.exe is not counted", () => {
	assert.ok(TASKLIST_ARGS.includes("WINDOWTITLE eq Claude"));
	assert.ok(TASKLIST_ARGS.includes("IMAGENAME eq claude.exe"));
	assert.ok(TASKLIST_ARGS.includes("/NH"));
});
