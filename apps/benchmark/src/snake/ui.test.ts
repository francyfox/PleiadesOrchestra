import { expect, test } from "bun:test";
import { SnakeGame } from "./game.ts";
import type { Decision } from "./policy.ts";
import { renderFrame } from "./ui.ts";

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes is the point.
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const decision: Decision = {
	probabilities: { UP: 0.61, DOWN: 0.05, LEFT: 0.2, RIGHT: 0.14 },
	proposed: "UP",
	executed: "LEFT",
	safeDirections: ["LEFT"],
	intervened: true,
	deadEndRisk: 0.25,
	foodReachable: 0.9,
	inferenceMs: 512.4,
	decisionMs: 513,
	plannerBest: "LEFT",
};

test("renders the board, the model's probabilities and the executed move", () => {
	const game = new SnakeGame({
		width: 8,
		height: 6,
		seed: 1,
		initialLength: 3,
	});
	const frame = plain(
		renderFrame(game, decision, { decisionsPerSecond: 1.95, color: false }),
	);
	const lines = frame.split("\n");

	// 6 board rows between a top and bottom border.
	expect(lines.filter((l) => l.startsWith("│"))).toHaveLength(6);
	expect(frame).toContain("UP");
	expect(frame).toContain("61.0%");
	expect(frame).toContain("LEFT  SHIELD");
	expect(frame).toContain("512 ms");
	expect(frame).toContain("1.95/s");
	expect(frame).toContain("Score 0");
});

test("without color there are no escape codes at all", () => {
	const game = new SnakeGame({
		width: 8,
		height: 6,
		seed: 1,
		initialLength: 3,
	});
	const frame = renderFrame(game, decision, {
		decisionsPerSecond: 1,
		color: false,
	});
	expect(frame).not.toContain("\x1b[");
});
