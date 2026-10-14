import { DIRECTIONS, type SnakeGame } from "./game.ts";
import type { Decision } from "./policy.ts";

export interface FrameOptions {
	/** Rolling measured rate of completed decisions. */
	decisionsPerSecond: number;
	color: boolean;
	threads?: number;
	paused?: boolean;
}

const BAR_WIDTH = 20;

/** One full terminal frame: board on the left, Laya's view of the move on the right. */
export function renderFrame(
	game: SnakeGame,
	decision: Decision | null,
	options: FrameOptions,
): string {
	const paint = (code: string, text: string) =>
		options.color ? `\x1b[${code}m${text}\x1b[0m` : text;

	const cells = new Map<string, string>();
	game.body.forEach(([x, y], i) => {
		cells.set(`${x},${y}`, i === 0 ? paint("1;92", "██") : paint("32", "▓▓"));
	});
	if (game.food)
		cells.set(`${game.food[0]},${game.food[1]}`, paint("91", "●●"));

	const board = [`┌${"──".repeat(game.width)}┐`];
	for (let y = 0; y < game.height; y++) {
		let row = "│";
		for (let x = 0; x < game.width; x++) row += cells.get(`${x},${y}`) ?? "  ";
		board.push(`${row}│`);
	}
	board.push(`└${"──".repeat(game.width)}┘`);
	board.push(
		`Score ${game.score}  Length ${game.body.length}  Ticks ${game.ticks}` +
			(game.alive ? "" : `  DEAD (${game.deathReason})`) +
			(game.won ? "  BOARD FULL" : ""),
	);

	const panel: string[] = [paint("1", "LAYA · NEXT MOVE"), ""];
	if (decision) {
		for (const d of DIRECTIONS) {
			const p = decision.probabilities[d];
			const filled = Math.round(p * BAR_WIDTH);
			const bar = "█".repeat(filled) + "·".repeat(BAR_WIDTH - filled);
			const marker = d === decision.executed ? "◀" : " ";
			panel.push(
				`${d.padEnd(5)} ${paint(d === decision.proposed ? "96" : "36", bar)} ${(p * 100).toFixed(1).padStart(5)}% ${marker}`,
			);
		}
		panel.push("");
		panel.push(
			`EXECUTED   ${decision.executed.padEnd(5)}${decision.intervened ? ` ${paint("93", "SHIELD")}` : ""}`,
		);
		panel.push(`DEAD-END   ${(decision.deadEndRisk * 100).toFixed(1)}%`);
		panel.push(`FOOD REACH ${(decision.foodReachable * 100).toFixed(1)}%`);
		panel.push("");
		panel.push(`INFERENCE  ${Math.round(decision.inferenceMs)} ms`);
	} else {
		panel.push("waiting for the first decision…");
	}
	panel.push(`DECISIONS  ${options.decisionsPerSecond.toFixed(2)}/s`);
	if (options.threads !== undefined) {
		panel.push(
			`THREADS    ${options.threads === 0 ? "ort default" : options.threads}`,
		);
	}
	panel.push("");
	panel.push(
		paint(
			"2",
			options.paused
				? "PAUSED · space resume · q quit"
				: "space pause · q quit",
		),
	);

	const width = game.width * 2 + 2;
	const rows = Math.max(board.length, panel.length);
	const lines: string[] = [];
	for (let i = 0; i < rows; i++) {
		const left = board[i] ?? "";
		// Pad by visible width — the board's cells are 2 chars and may carry escapes.
		const visible = i < game.height + 2 ? width : left.length;
		lines.push(
			`${left}${" ".repeat(Math.max(width - visible, 0) + 3)}${panel[i] ?? ""}`,
		);
	}
	return lines.join("\n");
}
