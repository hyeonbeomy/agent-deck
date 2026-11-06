import assert from "node:assert/strict";
import type os from "node:os";
import { test } from "node:test";

import { cpuPercent, cpuTimes, formatGb, ramPercent, SystemSampler } from "../src/sysmon";

function core(user: number, idle: number): os.CpuInfo {
	return { model: "x", speed: 1, times: { user, nice: 0, sys: 0, idle, irq: 0 } };
}

test("cpuPercent is the busy share of the elapsed time", () => {
	assert.equal(cpuPercent({ idle: 0, total: 0 }, { idle: 100, total: 100 }), 0);
	assert.equal(cpuPercent({ idle: 0, total: 0 }, { idle: 0, total: 100 }), 100);
	assert.equal(cpuPercent({ idle: 50, total: 100 }, { idle: 80, total: 200 }), 70);
});

test("cpuPercent is 0 when no time passed and never leaves 0..100", () => {
	assert.equal(cpuPercent({ idle: 10, total: 10 }, { idle: 10, total: 10 }), 0);
	assert.equal(cpuPercent({ idle: 10, total: 100 }, { idle: 5, total: 50 }), 0);
	assert.equal(cpuPercent({ idle: 0, total: 0 }, { idle: 150, total: 100 }), 0);
});

test("cpuTimes sums every core", () => {
	assert.deepEqual(cpuTimes([core(10, 20), core(5, 5)]), { idle: 25, total: 40 });
});

test("ramPercent", () => {
	assert.equal(ramPercent(100, 40), 60);
	assert.equal(ramPercent(0, 0), 0);
	assert.equal(ramPercent(100, 150), 0);
});

test("formatGb", () => {
	assert.equal(formatGb(9.8 * 2 ** 30), "9.8");
	assert.equal(formatGb(128 * 2 ** 30), "128");
	assert.equal(formatGb(0), "0.0");
});

test("SystemSampler keeps a bounded history and reads memory", () => {
	let tick = 0;
	const cpus = () => [core(tick * 10, tick * 10)]; // 50 % busy each step
	const sampler = new SystemSampler(
		3,
		() => {
			tick++;
			return cpus();
		},
		() => ({ total: 16 * 2 ** 30, free: 4 * 2 ** 30 })
	);
	let s = sampler.sample();
	assert.equal(s.cpu, 50);
	assert.equal(s.ram, 75);
	assert.equal(s.usedBytes, 12 * 2 ** 30);
	assert.deepEqual(s.history, [50]);
	sampler.sample();
	sampler.sample();
	s = sampler.sample();
	assert.deepEqual(s.history, [50, 50, 50]);
});
