import { LABELS } from "./config";
import { frameAt, mascotSvg, poseFor } from "./mascot";
import type { Session } from "./sessions";
import type { SysSample } from "./sysmon";
import { formatGb } from "./sysmon";

const SIZE = 144;
const FONT = "Segoe UI, Malgun Gothic, Apple SD Gothic Neo, Helvetica, Arial, sans-serif";

/** Mascot tint per agent; Claude keeps the default orange. */
const MASCOT_TINT: Record<Session["source"], { body?: string }> = {
	claude: {},
	codex: { body: "#a5b4fc" }
};

interface Palette {
	bg: string;
	fg: string;
	accent: string;
}

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Rough text width in px: CJK/Hangul glyphs are about 1em, Latin about 0.58em. */
function textWidth(s: string, fontSize: number): number {
	let w = 0;
	for (const ch of s) w += /[ᄀ-ᇿ⺀-꓏가-힯豈-﫿＀-￯]/.test(ch) ? 1 : 0.58;
	return w * fontSize;
}

/** Pick the largest font size (max..min) that fits; truncate with an ellipsis if even the minimum doesn't. */
function fit(text: string, maxWidth: number, max: number, min: number): { text: string; size: number } {
	for (let size = max; size >= min; size--) {
		if (textWidth(text, size) <= maxWidth) return { text, size };
	}
	const chars = [...text];
	while (chars.length > 1 && textWidth(chars.join("") + "…", min) > maxWidth) chars.pop();
	return { text: chars.join("") + "…", size: min };
}

export function formatElapsed(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
	return `${m}:${String(s).padStart(2, "0")}`;
}

function toDataUri(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function frame(bg: string, body: string, border?: string): string {
	const ring = border ? `<rect x="5" y="5" width="${SIZE - 10}" height="${SIZE - 10}" rx="14" fill="none" stroke="${border}" stroke-width="6"/>` : "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${bg}"/>${ring}${body}</svg>`;
}

function line(text: string, y: number, size: number, color: string, weight = 400, opacity = 1, x = SIZE / 2, anchor = "middle"): string {
	return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" fill-opacity="${opacity}">${esc(text)}</text>`;
}

function palette(s: Session, pulse: boolean): Palette {
	switch (s.state) {
		case "working":
			return { bg: "#1e3a8a", fg: "#ffffff", accent: "#93c5fd" };
		case "attention":
			return { bg: pulse ? "#d97706" : "#92400e", fg: "#ffffff", accent: "#fde68a" };
		case "done":
			return s.seen ? { bg: "#1f2937", fg: "#e5e7eb", accent: "#6b7280" } : { bg: "#166534", fg: "#ffffff", accent: "#bbf7d0" };
		case "error":
			return { bg: s.seen ? "#3f1d1d" : "#991b1b", fg: "#ffffff", accent: "#fecaca" };
		default:
			return { bg: "#1f2937", fg: "#e5e7eb", accent: "#6b7280" };
	}
}

function statusText(s: Session, now: number): string {
	switch (s.state) {
		case "working":
			return s.detail ? `${formatElapsed(now - s.stateSince)} · ${s.detail}` : `${LABELS.working} ${formatElapsed(now - s.stateSince)}`;
		case "attention":
			return s.attentionKind === "question" ? LABELS.question : s.attentionKind === "input" ? LABELS.input : LABELS.attention;
		case "done":
			return s.seen ? LABELS.seen : LABELS.done;
		case "error":
			return s.detail ? `${LABELS.error} · ${s.detail}` : LABELS.error;
		default:
			return LABELS.ready;
	}
}

/**
 * Key image for one session (or an empty slot when `s` is undefined).
 * `ticks` is the deck's 500 ms tick counter: it drives the mascot frames and the attention pulse.
 */
export function renderSlot(s: Session | undefined, now: number, ticks: number, pinned?: string): string {
	if (!s) {
		const body =
			line(LABELS.empty, 82, 34, "#4b5563", 300) + (pinned ? line(fit(pinned, 124, 16, 11).text, 120, 13, "#6b7280") : "");
		return toDataUri(frame("#0b0f17", body));
	}

	const pulse = Math.floor(ticks / 2) % 2 === 0;
	const p = palette(s, pulse);
	const label = fit(s.label, 130, 18, 12);
	const pose = poseFor(s);
	const status = fit(statusText(s, now), 134, 14, 10);

	const body =
		line(label.text, 21, label.size, p.fg, 700) +
		mascotSvg(pose, frameAt(pose, ticks), 0, 28, MASCOT_TINT[s.source]) +
		line(status.text, 132, status.size, p.accent, 700);

	const border = s.state === "attention" ? (pulse ? "#fde68a" : "#f59e0b") : undefined;
	return toDataUri(frame(p.bg, body, border));
}

/** Key image for the "Next Waiting" action. */
export function renderWaiting(waiting: Session[], pulse: boolean): string {
	if (waiting.length === 0) {
		return toDataUri(frame("#111827", line("0", 80, 50, "#4b5563", 700) + line(LABELS.waitingNone, 120, 15, "#6b7280", 600)));
	}
	const urgent = waiting[0].state === "attention";
	const bg = urgent ? (pulse ? "#d97706" : "#92400e") : "#166534";
	const first = fit(waiting[0].label, 124, 15, 11);
	const body =
		line(String(waiting.length), 74, 52, "#ffffff", 800) +
		line(LABELS.waitingSome, 100, 14, "#ffffff", 600, 0.85) +
		line(first.text, 126, first.size, urgent ? "#fde68a" : "#bbf7d0", 700);
	return toDataUri(frame(bg, body, urgent ? "#fde68a" : undefined));
}

/* ---------- CPU / RAM key ---------- */

function levelColor(pct: number): string {
	return pct < 50 ? "#22c55e" : pct < 80 ? "#f59e0b" : "#ef4444";
}

function bar(y: number, pct: number): string {
	const x = 12;
	const w = SIZE - 24;
	const fill = Math.round((w * Math.min(100, Math.max(0, pct))) / 100);
	return (
		`<rect x="${x}" y="${y}" width="${w}" height="10" rx="3" fill="#1f2937"/>` +
		(fill > 0 ? `<rect x="${x}" y="${y}" width="${Math.max(fill, 4)}" height="10" rx="3" fill="${levelColor(pct)}"/>` : "")
	);
}

/** CPU history as an area chart; the newest sample sits at the right edge. */
function sparkline(history: number[], length: number, top: number, height: number, color: string): string {
	if (history.length < 2) return "";
	const left = 12;
	const width = SIZE - 24;
	const step = width / Math.max(1, length - 1);
	const start = length - history.length;
	const pts = history.map((v, i) => `${(left + (start + i) * step).toFixed(1)},${(top + height - (height * v) / 100).toFixed(1)}`);
	const first = left + start * step;
	const last = left + (length - 1) * step;
	return (
		`<polygon points="${first.toFixed(1)},${top + height} ${pts.join(" ")} ${last.toFixed(1)},${top + height}" fill="${color}" fill-opacity="0.22"/>` +
		`<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`
	);
}

/** Key image for the "System Monitor" action. `historyLength` is the sampler's ring size. */
export function renderSysMonitor(s: SysSample, historyLength: number): string {
	const cpuColor = levelColor(s.cpu);
	const ramColor = levelColor(s.ram);
	const body =
		line(LABELS.cpu, 30, 14, "#9ca3af", 700, 1, 12, "start") +
		line(`${s.cpu}%`, 30, 22, cpuColor, 800, 1, SIZE - 12, "end") +
		bar(38, s.cpu) +
		sparkline(s.history, historyLength, 54, 28, cpuColor) +
		line(LABELS.ram, 102, 14, "#9ca3af", 700, 1, 12, "start") +
		line(`${s.ram}%`, 102, 22, ramColor, 800, 1, SIZE - 12, "end") +
		bar(110, s.ram) +
		line(`${formatGb(s.usedBytes)} / ${formatGb(s.totalBytes)} GB`, 135, 11, "#6b7280", 600);
	return toDataUri(frame("#0b0f17", body));
}

/* ---------- Claude App / Claude Here keys ---------- */

/** Claude desktop app key: an app-window glyph with a running/off dot. */
export function renderClaudeApp(running: boolean): string {
	const dot = running ? "#22c55e" : "#6b7280";
	const body =
		`<rect x="36" y="28" width="72" height="58" rx="8" fill="#1f2937" stroke="#9ca3af" stroke-width="3"/>` +
		`<rect x="36" y="28" width="72" height="16" rx="8" fill="#9ca3af"/>` +
		`<rect x="36" y="36" width="72" height="8" fill="#9ca3af"/>` +
		`<rect x="48" y="54" width="48" height="6" rx="3" fill="#d97757"/>` +
		`<rect x="48" y="66" width="30" height="6" rx="3" fill="#d97757" opacity="0.7"/>` +
		`<circle cx="104" cy="84" r="9" fill="${dot}" stroke="#111827" stroke-width="3"/>` +
		line(LABELS.claudeApp, 112, 13, "#e5e7eb", 700) +
		line(running ? LABELS.appRunning : LABELS.appOff, 130, 12, running ? "#86efac" : "#9ca3af", 600);
	return toDataUri(frame("#111827", body));
}

/** Claude Here key: a folder with a prompt, "start claude in the focused folder". */
export function renderClaudeHere(): string {
	const body =
		`<rect x="30" y="34" width="36" height="16" rx="5" fill="#d97706"/>` +
		`<rect x="30" y="42" width="84" height="52" rx="6" fill="#f59e0b"/>` +
		`<rect x="30" y="50" width="84" height="44" rx="6" fill="#fbbf24"/>` +
		line(">_", 82, 24, "#111827", 800) +
		line(LABELS.claudeHere, 116, 13, "#e5e7eb", 700) +
		line(LABELS.wslHint, 133, 11, "#9ca3af", 500);
	return toDataUri(frame("#111827", body));
}
