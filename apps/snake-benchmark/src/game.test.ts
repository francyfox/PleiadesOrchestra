import { describe, expect, test } from "bun:test";
import { hamiltonianCycle, SnakeGame } from "./game.ts";

/** Narrows away `undefined`/`null` in a test, failing loudly instead of a `!` assertion. */
function defined<T>(value: T | null | undefined): T {
	if (value === undefined || value === null)
		throw new Error("expected a value");
	return value;
}

function adjacent([ax, ay]: [number, number], [bx, by]: [number, number]) {
	return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

describe("hamiltonianCycle", () => {
	for (const [width, height] of [
		[4, 4],
		[24, 16],
		[5, 4],
		[4, 7],
	] as const) {
		test(`${width}x${height} visits every cell once with adjacent steps, closing edge included`, () => {
			const cycle = hamiltonianCycle(width, height);
			expect(cycle).toHaveLength(width * height);
			expect(new Set(cycle.map(([x, y]) => `${x},${y}`)).size).toBe(
				width * height,
			);
			for (let i = 0; i < cycle.length; i++) {
				const next = cycle[(i + 1) % cycle.length];
				expect(adjacent(defined(cycle[i]), defined(next))).toBe(true);
			}
		});
	}

	test("rejects boards without a cycle", () => {
		expect(() => hamiltonianCycle(5, 5)).toThrow();
		expect(() => hamiltonianCycle(3, 8)).toThrow();
	});
});

describe("SnakeGame", () => {
	test("starts alive, with the requested length and food on an empty cell", () => {
		const game = new SnakeGame({
			width: 8,
			height: 6,
			seed: 1,
			initialLength: 4,
		});
		expect(game.alive).toBe(true);
		expect(game.body).toHaveLength(4);
		const food = defined(game.food);
		expect(game.body.some(([x, y]) => x === food[0] && y === food[1])).toBe(
			false,
		);
	});

	test("going straight until the edge kills the snake by the wall", () => {
		const game = new SnakeGame({
			width: 4,
			height: 4,
			seed: 1,
			initialLength: 2,
		});
		// Any direction except reversing into the neck: with length 2 the cells
		// ahead are always empty, so the only possible death is the wall.
		const direction = defined(
			game.moves().find((m) => m.reason !== "reverse"),
		).direction;
		while (game.alive) game.step(direction);
		expect(game.deathReason).toBe("wall");
	});

	test("food reachability counts empty cells connected to the head", () => {
		const game = new SnakeGame({
			width: 6,
			height: 4,
			seed: 3,
			initialLength: 3,
		});
		const { reachable, space } = game.foodReachability();
		expect(reachable).toBe(true);
		// Everything except the body behind the head is open on a fresh board.
		expect(space).toBe(6 * 4 - 2);
	});

	test("any sequence of safe moves fills the whole board without dying (cycle shield invariant)", () => {
		for (const seed of [1, 2, 3]) {
			const game = new SnakeGame({
				width: 6,
				height: 4,
				seed,
				initialLength: 3,
			});
			let pick = seed;
			while (game.alive && !game.won) {
				const safe = game.moves().filter((m) => m.safe);
				expect(safe.length).toBeGreaterThan(0);
				// Deterministic but arbitrary choice among the admissible moves.
				pick = (pick * 1103515245 + 12345) % 2147483648;
				game.step(defined(safe[pick % safe.length]).direction);
				expect(game.cycleOrderValid()).toBe(true);
			}
			expect(game.won).toBe(true);
			expect(game.body).toHaveLength(6 * 4);
		}
	});

	test("the same seed reproduces the same food sequence", () => {
		const a = new SnakeGame({
			width: 8,
			height: 6,
			seed: 42,
			initialLength: 3,
		});
		const b = new SnakeGame({
			width: 8,
			height: 6,
			seed: 42,
			initialLength: 3,
		});
		expect(a.food).toEqual(b.food);
	});
});
