import type { FlowResult, FlowScenario, FlowStep } from "./flow.data.ts";

export type Side = "left" | "right" | "top" | "bottom";
export type Slot = { x: number; y: number; in: Side; out: Side };
export type Status = "idle" | "active" | "done" | "rejected";

const PER_ROW = 4;
const STEP_X = 260;
const STEP_Y = 300;
const NARROW_STEP = 160;

/**
 * Wide: a snake of rows of four (row 0 left to right, row 1 right to left, ...); the last node of a
 * row hands down to the first of the next. Narrow: one column. The options fan sits right of the
 * `fanAt` node (shortcut: assumed to be on a left-to-right row, put it there), top-left in `fan`.
 */
export function layoutFlow(ids: string[], narrow: boolean, fanAt?: string) {
	const slots: Record<string, Slot> = {};
	let extra = 0;
	ids.forEach((id, i) => {
		const row = Math.floor(i / PER_ROW);
		const col = i % PER_ROW;
		const ltr = row % 2 === 0;
		const last = i === ids.length - 1;
		slots[id] = narrow
			? { x: 0, y: i * NARROW_STEP + extra, in: "top", out: "bottom" }
			: {
					x: (ltr ? col : PER_ROW - 1 - col) * STEP_X,
					y: row * STEP_Y,
					in: col === 0 && row > 0 ? "top" : ltr ? "left" : "right",
					out: col === PER_ROW - 1 && !last ? "bottom" : ltr ? "right" : "left",
				};
		if (id === fanAt) {
			slots[id].out = "right";
			// Room for the stack in the column; the next node's edge comes from the chosen option.
			if (narrow) extra = NARROW_STEP;
		}
	});
	const at = fanAt ? slots[fanAt] : undefined;
	const fan = at && {
		x: narrow ? 240 : at.x + STEP_X,
		y: at.y - (narrow ? 70 : 110),
	};
	const rows = Math.ceil(ids.length / PER_ROW);
	const maxY = narrow
		? (ids.length - 1) * NARROW_STEP + extra
		: (rows - 1) * STEP_Y;
	// Figure height in rem, so fitView keeps the text readable.
	const height = narrow ? ((maxY + 110) * 0.85) / 16 : 4 + 12 * rows;
	return { slots, fan, height };
}

export const optionId = (id: string) => `opt-${id}`;

/** The run, one node a tick; the chosen (first) option comes right after its fan owner. */
export function runOrder(scenario: FlowScenario) {
	const chosen = scenario.fan?.options[0];
	return scenario.steps.flatMap(({ id }) =>
		id === scenario.fan?.at && chosen ? [id, optionId(chosen)] : [id],
	);
}

export function statusOf(order: string[], step: number, id: string): Status {
	const i = order.indexOf(id);
	return i < step ? "done" : i === step ? "active" : "idle";
}

/** A step with a price is a model call; code steps have only their time. */
export function totals(steps: FlowStep[]) {
	return steps.reduce(
		(sum, s) => ({
			ms: sum.ms + (s.ms ?? 0),
			usd: sum.usd + (s.usd ?? 0),
			calls: sum.calls + (s.usd === undefined ? 0 : 1),
		}),
		{ ms: 0, usd: 0, calls: 0 },
	);
}

// Per-call prices are millionths of a dollar: two significant digits (fixed notation down to 1e-6).
export const formatUsd = (usd: number) => `$${usd ? usd.toPrecision(2) : 0}`;

// Code steps take microseconds (the orchestrator logs fractional ms), model calls hundreds of ms.
export const formatMs = (ms: number) =>
	ms < 1
		? `${Math.round(ms * 1000)} µs`
		: ms < 10
			? `${Number(ms.toFixed(1))} ms`
			: ms < 1000
				? `${Math.round(ms)} ms`
				: `${(ms / 1000).toFixed(2)} s`;

/** The legend under the canvas: the whole run's time, price and model calls. */
export function legendOf(scenario: FlowScenario) {
	const sum = totals(scenario.steps);
	return { time: formatMs(sum.ms), cost: formatUsd(sum.usd), calls: sum.calls };
}

/** The "model · time · price" line under a step, empty for a step that was not measured. */
export function stepMeta(s: FlowStep) {
	return [
		s.model ?? "",
		s.ms === undefined ? "" : formatMs(s.ms),
		s.usd === undefined ? "" : formatUsd(s.usd),
	]
		.filter(Boolean)
		.join(" · ");
}

type Text = { tag: string; text: string };

/** xyflow nodes of one scenario at one tick of its run. */
export function buildNodes(
	scenario: FlowScenario,
	geometry: ReturnType<typeof layoutFlow>,
	texts: Record<string, Text>,
	step: number,
) {
	const order = runOrder(scenario);
	const options = scenario.fan?.options ?? [];
	const chosen = options[0] && optionId(options[0]);
	const answered = chosen ? step >= order.indexOf(chosen) : false;
	return [
		...scenario.steps.map((s) => ({
			id: s.id,
			type: "step",
			position: { x: geometry.slots[s.id].x, y: geometry.slots[s.id].y },
			data: {
				...texts[s.id],
				meta: stepMeta(s),
				in: geometry.slots[s.id].in,
				out: geometry.slots[s.id].out,
				status: statusOf(order, step, s.id),
			},
		})),
		...options.map((o, i) => {
			const id = optionId(o);
			return {
				id,
				type: "step",
				// The winner sits at the bottom, so its edge down to the next step crosses nothing.
				position: {
					x: geometry.fan?.x ?? 0,
					y: (geometry.fan?.y ?? 0) + (options.length - 1 - i) * 52,
				},
				data: {
					option: true,
					text: o,
					in: "left",
					out: "bottom",
					status:
						id === chosen
							? statusOf(order, step, id)
							: answered
								? "rejected"
								: "idle",
				},
			};
		}),
	];
}

export function buildEdges(scenario: FlowScenario, step: number) {
	const order = runOrder(scenario);
	const links: [string, string][] = order
		.slice(1)
		.map((id, i) => [order[i], id]);
	for (const o of scenario.fan?.options.slice(1) ?? [])
		links.push([scenario.fan?.at ?? "", optionId(o)]);
	return links.map(([source, target]) => {
		const at = order.indexOf(target);
		return {
			id: `${source}-${target}`,
			source,
			target,
			animated: at === step,
			style: `stroke: ${at !== -1 && at <= step ? "var(--accent)" : "var(--rule)"}; stroke-width: 2;`,
			markerEnd: { type: "arrowclosed" as const },
		};
	});
}

/** Orchestrator against `base`: times more successes, times faster, cost change in %. */
export function summarize(base: FlowResult, orchestra: FlowResult) {
	const times = (n: number) => Math.round(n * 10) / 10;
	return {
		success: times(orchestra.success / base.success),
		speed: times(base.p50Ms / orchestra.p50Ms),
		cost: Math.round(
			((orchestra.usdPerSuccess ?? 0) / (base.usdPerSuccess ?? 0) - 1) * 100,
		),
	};
}

/**
 * The headline figures: successes against the same model alone, speed and cost against the bigger
 * model alone (same successes). Only where the orchestrator wins: a claim never shows a loss as a gain.
 */
export function claims(results: {
	contenders: FlowResult[];
	/** The orchestrator setup the figures speak for. */
	main: string;
	same: string;
	bigger: string;
}) {
	const find = (name: string) =>
		results.contenders.find((c) => c.name === name) as FlowResult;
	const orchestra = find(results.main);
	const same = summarize(find(results.same), orchestra);
	const bigger = summarize(find(results.bigger), orchestra);
	return [
		{
			key: "success",
			value: `${same.success}×`,
			versus: results.same,
			show: same.success > 1,
		},
		{
			key: "speed",
			value: `${bigger.speed}×`,
			versus: results.bigger,
			show: bigger.speed > 1,
		},
		{
			key: "cost",
			value: `−${-bigger.cost}%`,
			versus: results.bigger,
			show: bigger.cost < 0,
		},
	]
		.filter((c) => c.show)
		.map(({ key, value, versus }) => ({
			key: key as "success" | "speed" | "cost",
			value,
			versus,
		}));
}

type Metric = "success" | "p50Ms" | "usdPerSuccess";
const METRICS: Record<
	Metric,
	{ format: (n: number) => string; higherWins: boolean }
> = {
	success: { format: (n) => `${Math.round(n * 100)}%`, higherWins: true },
	p50Ms: { format: formatMs, higherWins: false },
	usdPerSuccess: { format: formatUsd, higherWins: false },
};

/** One bar group per metric, best first; each bar's width is its share of the group's largest value. */
export function bars(contenders: FlowResult[]) {
	return (Object.keys(METRICS) as Metric[]).map((key) => {
		const { format, higherWins } = METRICS[key];
		// A contender without the metric (no cost: local models) has no bar in its group.
		const measured = contenders.flatMap((c) => {
			const value = c[key];
			return value === undefined ? [] : [{ ...c, value }];
		});
		const max = Math.max(...measured.map((c) => c.value));
		return {
			key,
			rows: measured
				.toSorted((a, b) =>
					higherWins ? b.value - a.value : a.value - b.value,
				)
				.map((c) => ({
					name: c.name,
					orchestra: c.orchestra === true,
					label: format(c.value),
					width: Math.round((c.value / max) * 100),
				})),
		};
	});
}
