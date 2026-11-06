import type { Session } from "./sessions";

/**
 * Pixel-art Claude mascot, in the spirit of CodeIsland's per-tool mascots: a boxy orange
 * creature whose pose follows what the agent is doing. Scenes are composed on a small cell grid
 * and emitted as crisp SVG rectangles, so the plugin needs no image assets.
 */
export type Pose = "working" | "sleeping" | "done" | "attention" | "question" | "error";

/** Cell grid: 36 x 20 cells of 4 px = 144 x 80 px. */
export const CANVAS = { cols: 36, rows: 20, cell: 4 } as const;

export const FRAME_COUNT: Record<Pose, number> = {
	working: 3,
	sleeping: 3,
	done: 2,
	attention: 2,
	question: 2,
	error: 2
};

/** Deck ticks (500 ms) per animation frame: typing is quick, sleeping is slow. */
const TICKS_PER_FRAME: Record<Pose, number> = {
	working: 1,
	sleeping: 2,
	done: 2,
	attention: 1,
	question: 1,
	error: 1
};

export interface MascotOptions {
	/** Body colour; the default is Claude orange. Other agents get their own tint. */
	body?: string;
	/** Arm colour; defaults to a darker shade of the body so limbs read as separate. */
	arm?: string;
}

const COLOR = {
	body: "#d97757",
	shade: "#b85c3c",
	light: "#f0a37f",
	eye: "#1a1a1a",
	keyboard: "#8a94a6",
	key: "#5f6b7d",
	keyHit: "#f1f5f9",
	z: "#cbd5e1",
	bubble: "#f8fafc",
	mark: "#b45309",
	question: "#1d4ed8",
	check: "#4ade80",
	spark: "#fde68a",
	cross: "#111827"
} as const;

/** Tiny paint surface: one colour per cell, exported as run-length <rect>s. */
export class PixelCanvas {
	readonly cells: (string | undefined)[];

	constructor(
		readonly cols: number,
		readonly rows: number
	) {
		this.cells = new Array<string | undefined>(cols * rows);
	}

	set(x: number, y: number, color: string): void {
		if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
		this.cells[y * this.cols + x] = color;
	}

	rect(x: number, y: number, w: number, h: number, color: string): void {
		for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
	}

	/** Draw ASCII rows; "." is transparent, any other char is looked up in `palette`. */
	blit(sprite: readonly string[], x: number, y: number, palette: Record<string, string>): void {
		sprite.forEach((row, j) => {
			[...row].forEach((ch, i) => {
				if (ch === ".") return;
				const color = palette[ch];
				if (color) this.set(x + i, y + j, color);
			});
		});
	}

	/** SVG rects for the painted cells, placed at (ox, oy) px with `cell` px per cell. */
	svg(ox: number, oy: number, cell: number): string {
		const out: string[] = [];
		for (let y = 0; y < this.rows; y++) {
			let x = 0;
			while (x < this.cols) {
				const color = this.cells[y * this.cols + x];
				if (!color) {
					x++;
					continue;
				}
				let run = 1;
				while (x + run < this.cols && this.cells[y * this.cols + x + run] === color) run++;
				out.push(`<rect x="${ox + x * cell}" y="${oy + y * cell}" width="${run * cell}" height="${cell}" fill="${color}"/>`);
				x += run;
			}
		}
		return out.join("");
	}
}

/* ---------- parts (all coordinates in cells) ---------- */

const BODY = { x: 9, y: 4, w: 18, h: 9 } as const;
const EYE_L = { x: 13, y: 7 } as const;
const EYE_R = { x: 21, y: 7 } as const;

type Eyes = "open" | "closed" | "happy" | "x";

function body(c: PixelCanvas, dx: number, dy: number, eyes: Eyes, color: string): void {
	const x = BODY.x + dx;
	const y = BODY.y + dy;
	c.rect(x, y, BODY.w, BODY.h, color);
	if (color === COLOR.body) {
		c.rect(x, y, BODY.w, 1, COLOR.light);
		c.rect(x, y + BODY.h - 1, BODY.w, 1, COLOR.shade);
	}
	for (const e of [EYE_L, EYE_R]) {
		const ex = e.x + dx;
		const ey = e.y + dy;
		switch (eyes) {
			case "open":
				c.rect(ex, ey, 2, 2, COLOR.eye);
				break;
			case "closed":
				c.rect(ex, ey + 1, 2, 1, COLOR.eye);
				break;
			case "happy":
				c.set(ex, ey + 1, COLOR.eye);
				c.set(ex + 1, ey, COLOR.eye);
				c.set(ex + 2, ey + 1, COLOR.eye);
				break;
			case "x":
				c.set(ex - 1, ey - 1, COLOR.cross);
				c.set(ex + 1, ey - 1, COLOR.cross);
				c.set(ex, ey, COLOR.cross);
				c.set(ex - 1, ey + 1, COLOR.cross);
				c.set(ex + 1, ey + 1, COLOR.cross);
				break;
		}
	}
}

/** Little feet under the body (not drawn while typing: the keyboard hides them). */
function feet(c: PixelCanvas, dy: number): void {
	c.rect(11, BODY.y + BODY.h + dy, 3, 1, COLOR.shade);
	c.rect(22, BODY.y + BODY.h + dy, 3, 1, COLOR.shade);
}

/** Arms are 2-cell wide blocks beside the body; y is the top cell. */
function arm(c: PixelCanvas, side: "left" | "right", y: number, h: number, color: string, dx = 0): void {
	c.rect((side === "left" ? BODY.x - 2 : BODY.x + BODY.w) + dx, y, 2, h, color);
}

function keyboard(c: PixelCanvas, hitIndex: number): void {
	c.rect(5, 13, 26, 4, COLOR.keyboard);
	for (let i = 0; i < 8; i++) c.rect(6 + i * 3, 14, 2, 1, i === hitIndex ? COLOR.keyHit : COLOR.key);
	c.rect(12, 16, 12, 1, COLOR.key); // space bar
}

const Z = ["zzzz", "..z.", ".z..", "zzzz"];
const CHECK = ["....c", "...c.", "c.c..", ".c..."];
const SPARK = [".s.", "sss", ".s."];
const QUESTION = ["qqq", "..q", ".qq", "...", ".q."];

function bubble(c: PixelCanvas, x: number, y: number, w: number, h: number): void {
	c.rect(x, y, w, h, COLOR.bubble);
	c.set(x, y + h, COLOR.bubble); // tail towards the body
}

/* ---------- scenes ---------- */

function paint(pose: Pose, frame: number, bodyColor: string, armColor: string): PixelCanvas {
	const c = new PixelCanvas(CANVAS.cols, CANVAS.rows);
	const f = ((frame % FRAME_COUNT[pose]) + FRAME_COUNT[pose]) % FRAME_COUNT[pose];

	switch (pose) {
		case "working": {
			const bob = f === 1 ? 1 : 0;
			body(c, 0, bob, "open", bodyColor);
			arm(c, "left", f === 2 ? 11 : 9, 3, armColor);
			arm(c, "right", f === 0 ? 11 : 9, 3, armColor);
			keyboard(c, (f * 3 + 1) % 8);
			break;
		}
		case "sleeping": {
			body(c, 0, 2, "closed", bodyColor);
			feet(c, 2);
			arm(c, "left", 12, 2, armColor);
			arm(c, "right", 12, 2, armColor);
			const zs = { z: COLOR.z };
			c.blit(Z, 27, 6 - f, zs);
			if (f >= 1) c.blit(Z, 30, 3, zs);
			if (f >= 2) c.blit(Z, 32, 0, zs);
			break;
		}
		case "done": {
			const bob = f === 1 ? 1 : 0;
			body(c, 0, bob, "happy", bodyColor);
			feet(c, bob);
			arm(c, "left", 1 + bob, 6, armColor);
			arm(c, "right", 1 + bob, 6, armColor);
			c.blit(CHECK, 30, 1, { c: COLOR.check });
			c.blit(SPARK, f === 0 ? 2 : 4, f === 0 ? 2 : 8, { s: COLOR.spark });
			c.blit(SPARK, f === 0 ? 31 : 29, f === 0 ? 8 : 12, { s: COLOR.spark });
			break;
		}
		case "attention":
		case "question": {
			body(c, 0, 0, "open", bodyColor);
			feet(c, 0);
			arm(c, "left", 9, 3, armColor);
			arm(c, "right", f === 0 ? 1 : 3, 6, armColor); // waving
			bubble(c, 30, f, 6, 7);
			if (pose === "attention") {
				c.rect(32, 1 + f, 2, 4, COLOR.mark);
				c.rect(32, 6 + f, 2, 1, COLOR.mark);
			} else {
				c.blit(QUESTION, 31, 1 + f, { q: COLOR.question });
			}
			break;
		}
		case "error": {
			const shake = f === 0 ? -1 : 1;
			body(c, shake, 0, "x", bodyColor);
			feet(c, 0);
			arm(c, "left", 9, 3, armColor, shake);
			arm(c, "right", 9, 3, armColor, shake);
			break;
		}
	}
	return c;
}

/** Painted grid for a pose/frame (exposed for tests and previews). */
export function mascotGrid(pose: Pose, frame: number, opts: MascotOptions = {}): PixelCanvas {
	const bodyColor = opts.body ?? COLOR.body;
	return paint(pose, frame, bodyColor, opts.arm ?? (bodyColor === COLOR.body ? COLOR.shade : bodyColor));
}

/** SVG fragment (no outer <svg>) of the mascot, top-left at (x, y) px. */
export function mascotSvg(pose: Pose, frame: number, x: number, y: number, opts: MascotOptions = {}): string {
	return `<g shape-rendering="crispEdges">${mascotGrid(pose, frame, opts).svg(x, y, CANVAS.cell)}</g>`;
}

/** Which frame to show at deck tick `ticks`. */
export function frameAt(pose: Pose, ticks: number): number {
	return Math.floor(ticks / TICKS_PER_FRAME[pose]) % FRAME_COUNT[pose];
}

export function poseFor(s: Session): Pose {
	switch (s.state) {
		case "working":
			return "working";
		case "attention":
			return s.attentionKind === "question" ? "question" : "attention";
		case "done":
			return s.seen ? "sleeping" : "done";
		case "error":
			return "error";
		default:
			return "sleeping";
	}
}
