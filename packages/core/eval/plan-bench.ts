/**
 * Planner benchmark: heap/bitset `plan()` vs the original linear-scan
 * `planReference()` on synthetic catalogs (not part of `bun test`):
 *   bun run bench:plan
 * Also asserts both return the same plan for every case.
 */
import { plan } from "#core/goap/plan";
import { planReference } from "#core/goap/plan-reference";
import type { GoapAction } from "#core/goap/types";

/**
 * Layered catalog: fact `f<i>` is producible by `width` alternative actions
 * of different cost, each needing `f<i-1>`; every 4th layer also needs a side
 * fact `s<i>` (alternating boolean / string value) from its own action. Costs
 * vary so the cheapest alternative is not always the first declared.
 */
function catalog(layers: number, width: number): GoapAction[] {
	const actions: GoapAction[] = [];
	const mk = (
		name: string,
		cost: number,
		preconditions: GoapAction["preconditions"],
		effects: GoapAction["effects"],
	) =>
		actions.push({
			name,
			cost,
			preconditions,
			effects,
			execute: async () => ({}),
		});
	for (let i = 0; i < layers; i++) {
		const side = i % 4 === 0;
		const sideValue = i % 8 === 0 ? true : "ready";
		if (side) mk(`side${i}`, 1 + (i % 3), {}, { [`s${i}`]: sideValue });
		for (let w = 0; w < width; w++) {
			mk(
				`step${i}_${w}`,
				1 + ((i * 7 + w * 3) % 5),
				{
					...(i > 0 ? { [`f${i - 1}`]: true } : {}),
					...(side ? { [`s${i}`]: sideValue } : {}),
				},
				{ [`f${i}`]: true },
			);
		}
	}
	return actions;
}

function time(fn: () => unknown, budgetMs = 400): { ms: number; runs: number } {
	fn();
	const start = performance.now();
	let runs = 0;
	while (performance.now() - start < budgetMs || runs < 3) {
		fn();
		runs++;
	}
	return { ms: (performance.now() - start) / runs, runs };
}

const cases = [
	{ layers: 5, width: 3 }, // ~16 actions: about the static set
	{ layers: 16, width: 3 }, // ~50
	{ layers: 32, width: 3 }, // ~100
	{ layers: 44, width: 3 }, // ~145
];

console.log("actions | reference ms | plan ms | speedup | plan length");
for (const { layers, width } of cases) {
	const actions = catalog(layers, width);
	const goal = { [`f${layers - 1}`]: true };
	const a = planReference({}, goal, actions);
	const b = plan({}, goal, actions);
	if (!a || !b || a.length !== b.length || a.some((x, i) => x !== b[i])) {
		throw new Error(`plans differ at ${actions.length} actions`);
	}
	const ref = time(() => planReference({}, goal, actions));
	const now = time(() => plan({}, goal, actions));
	console.log(
		`${String(actions.length).padStart(7)} | ${ref.ms.toFixed(3).padStart(12)} | ${now.ms.toFixed(3).padStart(7)} | ${(ref.ms / now.ms).toFixed(1).padStart(6)}x | ${a.length}`,
	);
}
