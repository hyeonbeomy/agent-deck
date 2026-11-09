// Agent Deck - writes the key images used in the READMEs (docs/images/keys/*.svg).
//
//   npm run readme-keys
//
// Every image is exactly what the plugin draws on a key (same render functions), with the
// corners rounded like a key cap. Run it again after changing how a key is drawn.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderClaudeApp, renderClaudeHere, renderSlot, renderSysMonitor, renderWaiting } from "../src/render";
import type { Session } from "../src/sessions";

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "images", "keys");
const now = Date.UTC(2026, 0, 1, 12, 0, 0);
const GB = 2 ** 30;

function session(over: Partial<Session> = {}): Session {
	return {
		key: "claude:demo",
		source: "claude",
		id: "demo",
		label: "agent-deck",
		state: "ready",
		seen: false,
		startedAt: now - 600_000,
		stateSince: now - 83_000, // "1:23" on the working key
		lastEventAt: now,
		lastHookTs: 0,
		...over
	};
}

/** The render functions return data URIs; the README needs files. */
function svgOf(dataUri: string): string {
	return Buffer.from(dataUri.slice(dataUri.indexOf(",") + 1), "base64").toString("utf8");
}

/** The plugin draws a full square (the device masks the corners); round them for the README. */
function rounded(svg: string): string {
	const open = svg.indexOf(">") + 1;
	const close = svg.lastIndexOf("</svg>");
	return (
		svg.slice(0, open) +
		'<defs><clipPath id="key"><rect width="144" height="144" rx="20"/></clipPath></defs><g clip-path="url(#key)">' +
		svg.slice(open, close) +
		"</g></svg>"
	);
}

const waiting = [
	session({ state: "attention", attentionKind: "permission" }),
	session({ key: "claude:docs", id: "docs", label: "docs", state: "done" })
];
const cpuHistory = Array.from({ length: 36 }, (_, i) => Math.round(20 + 12 * Math.sin(i / 4) + (i % 9 === 0 ? 18 : 0)));

// ticks pick the mascot frame and, for waiting states, the bright half of the pulse.
const images: Record<string, string> = {
	"session-working": renderSlot(session({ state: "working" }), now, 1),
	"session-approve": renderSlot(session({ state: "attention", attentionKind: "permission" }), now, 0),
	"session-question": renderSlot(session({ state: "attention", attentionKind: "question" }), now, 0),
	"session-done": renderSlot(session({ state: "done" }), now, 0),
	"session-asleep": renderSlot(session({ state: "ready" }), now, 4),
	"session-error": renderSlot(session({ state: "error" }), now, 0),
	"next-clear": renderWaiting([], true),
	"next-waiting": renderWaiting(waiting, true),
	"system-monitor": renderSysMonitor({ cpu: 23, ram: 41, usedBytes: 13.1 * GB, totalBytes: 32 * GB, history: cpuHistory }, 36),
	"claude-app-running": renderClaudeApp(true),
	"claude-app-off": renderClaudeApp(false),
	"claude-here": renderClaudeHere()
};

fs.mkdirSync(outDir, { recursive: true });
for (const [name, dataUri] of Object.entries(images)) {
	fs.writeFileSync(path.join(outDir, `${name}.svg`), rounded(svgOf(dataUri)) + "\n");
}
console.log(`wrote ${Object.keys(images).length} key images to ${path.relative(process.cwd(), outDir)}`);
