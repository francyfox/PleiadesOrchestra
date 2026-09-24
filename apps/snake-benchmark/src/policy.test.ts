import { describe, expect, test } from "bun:test";
import { SnakeGame } from "./game.ts";
import { buildRequest, type DecideFn, decide } from "./policy.ts";

function fakeLaya(
	probabilities: Record<string, number>,
	risk = 0.9,
	food = 0.8,
): DecideFn {
	return async () => ({
		move: { type: "choice", probabilities },
		risk: { type: "noul", noul: risk },
		food: { type: "noul", noul: food },
	});
}

describe("buildRequest", () => {
	test("compact prompt labels every direction and asks the three questions", () => {
		const game = new SnakeGame({
			width: 8,
			height: 6,
			seed: 1,
			initialLength: 3,
		});
		const { state, questions } = buildRequest(game, "compact");

		expect(state).toContain("Safe route: yes.");
		expect(Object.keys(questions)).toEqual(["move", "risk", "food"]);
		expect(questions.move.type).toBe("choice");
		expect(Object.keys(questions.move.criteria)).toEqual([
			"UP",
			"DOWN",
			"LEFT",
			"RIGHT",
		]);
		const labels = Object.values(questions.move.criteria);
		expect(labels.filter((l) => l.includes("Best"))).toHaveLength(1);
	});

	test("detailed prompt describes the board in the state", () => {
		const game = new SnakeGame({
			width: 8,
			height: 6,
			seed: 1,
			initialLength: 3,
		});
		const { state } = buildRequest(game, "detailed");
		expect(state).toContain("Snake length: 3.");
	});
});

describe("decide", () => {
	test("executes the model's first choice when it is safe", async () => {
		const game = new SnakeGame({
			width: 8,
			height: 6,
			seed: 1,
			initialLength: 3,
		});
		const best = game.moves().find((m) => m.safe)!.direction;
		const probabilities = {
			UP: 0.1,
			DOWN: 0.1,
			LEFT: 0.1,
			RIGHT: 0.1,
			[best]: 0.7,
		};

		const decision = await decide(fakeLaya(probabilities), game, {
			guarded: true,
			prompt: "compact",
		});

		expect(decision.proposed).toBe(best);
		expect(decision.executed).toBe(best);
		expect(decision.intervened).toBe(false);
		expect(decision.deadEndRisk).toBeCloseTo(0.1);
		expect(decision.foodReachable).toBeCloseTo(0.8);
	});

	test("the shield replaces an unsafe first choice with the most probable safe one", async () => {
		const game = new SnakeGame({
			width: 8,
			height: 6,
			seed: 1,
			initialLength: 3,
		});
		const moves = game.moves();
		const unsafe = moves.find((m) => !m.safe)!.direction;
		const safe = moves.find((m) => m.safe)!.direction;
		const probabilities = { UP: 0.05, DOWN: 0.05, LEFT: 0.05, RIGHT: 0.05 };
		probabilities[unsafe as keyof typeof probabilities] = 0.6;
		probabilities[safe as keyof typeof probabilities] = 0.3;

		const guarded = await decide(fakeLaya(probabilities), game, {
			guarded: true,
			prompt: "compact",
		});
		expect(guarded.proposed).toBe(unsafe);
		expect(guarded.executed).toBe(safe);
		expect(guarded.intervened).toBe(true);

		const unassisted = await decide(fakeLaya(probabilities), game, {
			guarded: false,
			prompt: "compact",
		});
		expect(unassisted.executed).toBe(unsafe);
		expect(unassisted.intervened).toBe(false);
	});

	test("rejects a probability outside [0, 1] instead of moving", async () => {
		const game = new SnakeGame({
			width: 8,
			height: 6,
			seed: 1,
			initialLength: 3,
		});
		const broken = fakeLaya({ UP: 1.5, DOWN: 0, LEFT: 0, RIGHT: 0 });
		await expect(
			decide(broken, game, { guarded: true, prompt: "compact" }),
		).rejects.toThrow();
	});
});
