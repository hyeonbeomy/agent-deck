import assert from "node:assert/strict";
import { test } from "node:test";

import { CANVAS, FRAME_COUNT, frameAt, mascotGrid, mascotSvg, type Pose, poseFor } from "../src/mascot";
import type { Session } from "../src/sessions";

const POSES = Object.keys(FRAME_COUNT) as Pose[];

function session(over: Partial<Session>): Session {
	return {
		key: "claude:x",
		source: "claude",
		id: "x",
		label: "x",
		state: "ready",
		seen: false,
		startedAt: 0,
		stateSince: 0,
		lastEventAt: 0,
		lastHookTs: 0,
		...over
	};
}

/** Every <rect> of an SVG fragment as numbers. */
function rects(svg: string): { x: number; y: number; w: number; h: number; fill: string }[] {
	const out: { x: number; y: number; w: number; h: number; fill: string }[] = [];
	const re = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="([^"]+)"/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(svg))) out.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], fill: m[5] });
	return out;
}

test("every pose and frame draws something that stays inside the canvas", () => {
	const ox = 0;
	const oy = 28;
	for (const pose of POSES) {
		for (let f = 0; f < FRAME_COUNT[pose]; f++) {
			const svg = mascotSvg(pose, f, ox, oy);
			const rs = rects(svg);
			assert.ok(rs.length > 10, `${pose}#${f} has only ${rs.length} rects`);
			for (const r of rs) {
				assert.ok(r.x >= ox && r.x + r.w <= ox + CANVAS.cols * CANVAS.cell, `${pose}#${f} rect x out of range: ${JSON.stringify(r)}`);
				assert.ok(r.y >= oy && r.y + r.h <= oy + CANVAS.rows * CANVAS.cell, `${pose}#${f} rect y out of range: ${JSON.stringify(r)}`);
				assert.equal(r.h, CANVAS.cell);
			}
		}
	}
});

test("frames of a pose differ from each other and wrap around", () => {
	for (const pose of POSES) {
		const n = FRAME_COUNT[pose];
		assert.ok(n >= 2, `${pose} should animate`);
		assert.notEqual(mascotSvg(pose, 0, 0, 0), mascotSvg(pose, 1, 0, 0), `${pose} frames 0 and 1 are identical`);
		assert.equal(mascotSvg(pose, n, 0, 0), mascotSvg(pose, 0, 0, 0), `${pose} frame ${n} should wrap to 0`);
	}
});

test("the body colour can be swapped for other agents", () => {
	const grid = mascotGrid("working", 0, { body: "#a5b4fc" });
	const colours = new Set(grid.cells.filter((c): c is string => !!c));
	assert.ok(colours.has("#a5b4fc"));
	assert.ok(!colours.has("#d97757"));
});

test("frameAt advances at the pose's own pace", () => {
	assert.equal(frameAt("working", 0), 0);
	assert.equal(frameAt("working", 1), 1);
	assert.equal(frameAt("working", 3), 0);
	assert.equal(frameAt("sleeping", 0), 0);
	assert.equal(frameAt("sleeping", 1), 0);
	assert.equal(frameAt("sleeping", 2), 1);
});

test("poseFor maps session state to a pose", () => {
	assert.equal(poseFor(session({ state: "ready" })), "sleeping");
	assert.equal(poseFor(session({ state: "working" })), "working");
	assert.equal(poseFor(session({ state: "attention", attentionKind: "permission" })), "attention");
	assert.equal(poseFor(session({ state: "attention", attentionKind: "input" })), "attention");
	assert.equal(poseFor(session({ state: "attention", attentionKind: "question" })), "question");
	assert.equal(poseFor(session({ state: "done", seen: false })), "done");
	assert.equal(poseFor(session({ state: "done", seen: true })), "sleeping");
	assert.equal(poseFor(session({ state: "error" })), "error");
});
