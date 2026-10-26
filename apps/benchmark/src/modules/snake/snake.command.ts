import { cpus, totalmem } from "node:os";
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";
import { config as env } from "../config/config.service.ts";
import { loadLaya } from "../laya/laya.ts";
import type { LoadedLaya } from "../laya/laya.types.ts";
import { resultPath } from "../report/report.service.ts";
import { summarizeLatency } from "../stats/stats.service.ts";
import { decide } from "./snake.service.ts";
import { SnakeGame } from "./snake.ts";
import type { Decision, PromptStyle } from "./snake.types.ts";
import { renderFrame } from "./snake.view.ts";

// Laya (in-process ONNX) driving Snake, measuring decision latency.
//
//   bun snake [--headless] [--steps N] [--threads 1,2,4] [--prompt compact|detailed] …
//
// Live mode draws the board in the terminal (q quits, space pauses);
// --headless only measures and prints a summary.
//
// LAYA_BASE_URL (+ LAYA_API_KEY) in .env plays against a Laya server
// (gamma-decision's /v1/systemone, e.g. on a GPU box) instead: one pass, the
// times include the network, --threads doesn't apply.

const count = (fallback: number) =>
	z.coerce.number().int().min(0).default(fallback);

type Config = {
	width: number;
	height: number;
	seed: number;
	initialLength: number;
	steps: number;
	warmup: number;
	threads: number[];
	prompt: PromptStyle;
	guarded: boolean;
	fps: number | undefined;
	repo: string;
	modelDir: string | undefined;
	/** A Laya server instead of the in-process model. */
	server: string | undefined;
};

/** Laya for one pass: the server's, or loaded here with `threads`. */
function openLaya(config: Config, threads: number): Promise<LoadedLaya> {
	return loadLaya({
		baseUrl: config.server,
		apiKey: env.LAYA_API_KEY,
		repo: config.repo,
		modelDir: config.modelDir,
		threads,
	});
}

export default defineCommand({
	name: "snake",
	description: "Laya: decision latency, playing Snake",
	options: {
		headless: option(z.boolean().default(false), {
			description: "No terminal UI, just measure and print a summary",
			argumentKind: "flag",
		}),
		steps: option(count(200), {
			description: "Measured decisions per thread setting",
		}),
		warmup: option(count(5), {
			description: "Unmeasured decisions after loading",
		}),
		threads: option(
			z
				.string()
				.default("4")
				.transform((value) => value.split(",").map(Number))
				.pipe(z.array(z.number().int().min(0)).min(1)),
			{
				description:
					"onnxruntime intra-op threads to compare, e.g. 1,2,4,6 (0 = onnxruntime's default; default 4). Live mode uses the first",
			},
		),
		prompt: option(z.enum(["compact", "detailed"]).default("compact"), {
			description: "compact | detailed",
		}),
		unassisted: option(z.boolean().default(false), {
			description: "Execute the model's raw first choice, no safety shield",
			argumentKind: "flag",
		}),
		fps: option(z.coerce.number().int().min(1).optional(), {
			description:
				"Live mode pacing cap (default: as fast as inference allows)",
		}),
		output: option(z.string().optional(), {
			description:
				"JSON report path in --headless (default results/snake/<timestamp>.json; refuses to overwrite)",
		}),
		width: option(count(24), { description: "Board width (>= 4)" }),
		height: option(count(16), {
			description: "Board height (>= 4, one dimension even)",
		}),
		seed: option(count(7), {
			description: "First game's seed; each new game uses seed+1",
		}),
		"initial-length": option(count(6), {
			description: "Starting snake length",
		}),
		repo: option(z.string().default("receptron/laya-onnx"), {
			description: "Hugging Face repo of the ONNX bundle",
		}),
		"model-dir": option(z.string().optional(), {
			description: "Local bundle instead of the cache/Hub",
		}),
	},
	handler: async ({ flags }) => {
		if (flags.output && (await Bun.file(flags.output).exists())) {
			throw new Error(`${flags.output} already exists — not overwriting`);
		}
		const config: Config = {
			width: flags.width,
			height: flags.height,
			seed: flags.seed,
			initialLength: flags["initial-length"],
			steps: flags.steps,
			warmup: flags.warmup,
			threads: flags.threads,
			prompt: flags.prompt,
			guarded: !flags.unassisted,
			fps: flags.fps,
			repo: flags.repo,
			modelDir: flags["model-dir"],
			server: env.LAYA_BASE_URL,
		};
		if (flags.headless) await runHeadless(config, flags.output);
		else await runLive(config);
	},
});

/** Plays games back to back (new seed after a death or a full board). */
function games(config: Config) {
	let seed = config.seed;
	let game = newGame(seed);
	function newGame(s: number) {
		return new SnakeGame({
			width: config.width,
			height: config.height,
			seed: s,
			initialLength: config.initialLength,
		});
	}
	return {
		get current() {
			return game;
		},
		/** Returns true if the game just ended and a new one was started. */
		advance(
			decision: Decision,
		): { ended: false } | { ended: true; game: SnakeGame } {
			game.step(decision.executed);
			if (game.alive && !game.won) return { ended: false };
			const finished = game;
			seed++;
			game = newGame(seed);
			return { ended: true, game: finished };
		},
	};
}

async function runHeadless(config: Config, output: string | undefined) {
	const results = [];
	// A server has its own threads: one pass.
	const passes = config.server ? config.threads.slice(0, 1) : config.threads;
	for (const threads of passes) {
		process.stderr.write(
			config.server
				? `${config.server}: `
				: `threads=${threads === 0 ? "default" : threads}: loading model… `,
		);
		const laya = await openLaya(config, threads);
		process.stderr.write(`${(laya.loadMs / 1000).toFixed(1)}s, warming up… `);

		const play = games(config);
		const options = { guarded: config.guarded, prompt: config.prompt };
		for (let i = 0; i < config.warmup; i++) {
			play.advance(await decide(laya.decide, play.current, options));
		}

		const inference: number[] = [];
		const decisionTimes: number[] = [];
		let interventions = 0;
		let deaths = 0;
		let wins = 0;
		let foodEaten = 0;
		const wallStart = performance.now();
		for (let i = 0; i < config.steps; i++) {
			const d = await decide(laya.decide, play.current, options);
			inference.push(d.inferenceMs);
			decisionTimes.push(d.decisionMs);
			if (d.intervened) interventions++;
			const scoreBefore = play.current.score;
			const step = play.advance(d);
			if (step.ended) {
				if (step.game.won) wins++;
				else deaths++;
				foodEaten += step.game.score - scoreBefore;
			} else {
				foodEaten += play.current.score - scoreBefore;
			}
			if ((i + 1) % 20 === 0) process.stderr.write(`${i + 1} `);
		}
		const wallMs = performance.now() - wallStart;
		await laya.close();

		const result = {
			threads: config.server ? "server" : threads,
			loadMs: Math.round(laya.loadMs),
			steps: config.steps,
			inferenceMs: summarizeLatency(inference),
			decisionMs: summarizeLatency(decisionTimes),
			/** Sustained rate including planner + game update, not just inference. */
			stepsPerSecond: config.steps / (wallMs / 1000),
			interventions,
			deaths,
			wins,
			foodEaten,
		};
		results.push(result);
		process.stderr.write(
			`done: p50 ${result.inferenceMs.p50.toFixed(0)} ms, ${result.stepsPerSecond.toFixed(2)} steps/s\n`,
		);
	}

	const report = {
		createdAt: new Date().toISOString(),
		hardware: {
			cpu: cpus()[0]?.model ?? "unknown",
			logicalCores: cpus().length,
			totalMemGb: Math.round(totalmem() / 1024 ** 3),
		},
		runtime: {
			bun: Bun.version,
			transport: config.server
				? `http ${config.server}`
				: "in-process onnxruntime-node",
		},
		config,
		results,
	};

	console.table(
		results.map((r) => ({
			threads: r.threads === 0 ? "default" : r.threads,
			"load s": (r.loadMs / 1000).toFixed(1),
			"p50 ms": r.inferenceMs.p50.toFixed(0),
			"p90 ms": r.inferenceMs.p90.toFixed(0),
			"p99 ms": r.inferenceMs.p99.toFixed(0),
			"steps/s": r.stepsPerSecond.toFixed(2),
			shield: r.interventions,
			deaths: r.deaths,
		})),
	);
	const path = resultPath("snake", "json", output);
	await Bun.write(path, `${JSON.stringify(report, null, "\t")}\n`);
	console.log(`report: ${path}`);
}

async function runLive(config: Config) {
	const color = !process.env.NO_COLOR;
	const threads = config.server ? undefined : (config.threads[0] ?? 0);
	process.stdout.write(
		config.server
			? `Laya at ${config.server}\n`
			: "loading Laya (in-process)…\n",
	);
	const laya = await openLaya(config, threads ?? 0);

	let quit = false;
	let paused = false;
	const restore = () => {
		if (process.stdin.isTTY) process.stdin.setRawMode(false);
		process.stdout.write("\x1b[?25h\x1b[?1049l");
	};
	if (process.stdin.isTTY) process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.on("data", (data) => {
		const key = data.toString();
		if (key === "q" || key === "\u0003") quit = true;
		if (key === " ") paused = !paused;
	});
	process.stdout.write("\x1b[?1049h\x1b[?25l");

	const play = games(config);
	const recent: number[] = [];
	let last: Decision | null = null;
	const minFrameMs = config.fps ? 1000 / config.fps : 0;
	try {
		while (!quit) {
			const rate =
				recent.length > 1
					? (recent.length - 1) /
						(((recent.at(-1) as number) - (recent[0] as number)) / 1000)
					: 0;
			process.stdout.write(
				`\x1b[H\x1b[2J${renderFrame(play.current, last, { decisionsPerSecond: rate, color, threads, paused })}`,
			);
			if (paused) {
				await Bun.sleep(100);
				continue;
			}
			const tickStart = performance.now();
			last = await decide(laya.decide, play.current, {
				guarded: config.guarded,
				prompt: config.prompt,
			});
			recent.push(performance.now());
			if (recent.length > 20) recent.shift();
			const step = play.advance(last);
			if (step.ended) last = null;
			const spare = minFrameMs - (performance.now() - tickStart);
			if (spare > 0) await Bun.sleep(spare);
		}
	} finally {
		restore();
		await laya.close();
	}
	process.exit(0);
}
