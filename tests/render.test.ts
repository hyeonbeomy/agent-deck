import assert from "node:assert/strict";
import { test } from "node:test";

import { renderClaudeApp, renderClaudeHere } from "../src/render";

/** The key image is an SVG data URI; return the SVG text whichever encoding is used. */
function svgOf(uri: string): string {
	assert.ok(uri.startsWith("data:image/svg+xml"), `not an svg data uri: ${uri.slice(0, 40)}`);
	const comma = uri.indexOf(",");
	const head = uri.slice(0, comma);
	const body = uri.slice(comma + 1);
	return head.includes("base64") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body);
}

test("renderClaudeApp shows whether the desktop app is running", () => {
	const on = svgOf(renderClaudeApp(true));
	const off = svgOf(renderClaudeApp(false));
	assert.ok(on.includes("RUNNING"));
	assert.ok(off.includes("OFF"));
	assert.notEqual(on, off);
});

test("renderClaudeHere draws the launch key", () => {
	const svg = svgOf(renderClaudeHere());
	assert.ok(svg.includes("<svg"));
	assert.ok(svg.includes("CLAUDE HERE"));
});
