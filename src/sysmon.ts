import os from "node:os";

/** Summed CPU time counters across all cores, in ms since boot. */
export interface CpuTimes {
	idle: number;
	total: number;
}

export interface MemInfo {
	total: number;
	free: number;
}

export interface SysSample {
	/** 0..100 */
	cpu: number;
	/** 0..100 */
	ram: number;
	usedBytes: number;
	totalBytes: number;
	/** Recent CPU percentages, oldest first, at most `historyLength` long. */
	history: number[];
}

export function cpuTimes(cpus: os.CpuInfo[] = os.cpus()): CpuTimes {
	let idle = 0;
	let total = 0;
	for (const c of cpus) {
		idle += c.times.idle;
		total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
	}
	return { idle, total };
}

function clamp(n: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, n));
}

/** CPU usage between two readings, as a whole percentage. No elapsed time means 0. */
export function cpuPercent(prev: CpuTimes, next: CpuTimes): number {
	const elapsed = next.total - prev.total;
	if (elapsed <= 0) return 0;
	const busy = elapsed - (next.idle - prev.idle);
	return clamp(Math.round((busy / elapsed) * 100), 0, 100);
}

export function ramPercent(total: number, free: number): number {
	if (total <= 0) return 0;
	return clamp(Math.round(((total - free) / total) * 100), 0, 100);
}

/** Bytes as gigabytes with one decimal below 100 GB ("9.8"), none above ("128"). */
export function formatGb(bytes: number): string {
	const gb = bytes / 2 ** 30;
	return gb >= 100 ? gb.toFixed(0) : gb.toFixed(1);
}

/** Samples CPU and memory; call `sample()` on a fixed interval (the first CPU reading is 0). */
export class SystemSampler {
	#prev: CpuTimes;
	readonly #history: number[] = [];

	constructor(
		readonly historyLength = 36,
		private readonly readCpus: () => os.CpuInfo[] = os.cpus,
		private readonly readMem: () => MemInfo = () => ({ total: os.totalmem(), free: os.freemem() })
	) {
		this.#prev = cpuTimes(readCpus());
	}

	sample(): SysSample {
		const next = cpuTimes(this.readCpus());
		const cpu = cpuPercent(this.#prev, next);
		this.#prev = next;
		this.#history.push(cpu);
		if (this.#history.length > this.historyLength) this.#history.shift();

		const mem = this.readMem();
		return {
			cpu,
			ram: ramPercent(mem.total, mem.free),
			usedBytes: Math.max(0, mem.total - mem.free),
			totalBytes: mem.total,
			history: [...this.#history]
		};
	}
}
