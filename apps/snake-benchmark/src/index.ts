import { cpus, totalmem } from "node:os";
import { parseArgs } from "node:util";
import { SnakeGame } from "./game.ts";
import { loadLaya } from "./laya.ts";
import { type Decision, decide, type PromptStyle } from "./policy.ts";
import { summarize } from "./stats.ts";
import { renderFrame } from "./ui.ts";

const USAGE = `snake-benchmark — Laya (in-process ONNX) driving Snake, measuring decision latency.

  bun src/index.ts [options]

  --headless            no terminal UI, just measure and print a summary
  --steps N             measured decisions per thread setting (default 200)
  --warmup N            unmeasured decisions after loading (default 5)
  --threads LIST        onnxruntime intra-op threads to compare, e.g. 1,2,4,6,12
                        (0 = onnxruntime default; default "0"). Live mode uses the first.
  --prompt STYLE        compact | detailed (default compact)
  --unassisted          execute the model's raw first choice, no safety shield
  --fps N               live mode pacing cap (default: as fast as inference allows)
  --output FILE         write the JSON report there (refuses to overwrite)
  --width/--height N    board size (default 24x16; >= 4, one dimension even)
  --seed N              first game's seed (default 7); each new game uses seed+1
  --initial-length N    starting snake length (default 6)
  --repo ID             Hugging Face repo of the ONNX bundle (default receptron/laya-onnx)
  --model-dir DIR       local bundle instead of the cache/Hub
`;

const { values: args } = parseArgs({
	options: {
		headless: { type: "boolean", default: false },
		steps: { type: "string", default: "200" },
		warmup: { type: "string", default: "5" },
		threads: { type: "string", default: "0" },
		prompt: { type: "string", default: "compact" },
		unassisted: { type: "boolean", default: false },
		fps: { type: "string" },
		output: { type: "string" },
		width: { type: "string", default: "24" },
		height: { type: "string", default: "16" },
		seed: { type: "string", default: "7" },
		"initial-length": { type: "string", default: "6" },
		repo: { type: "string", default: "receptron/laya-onnx" },
		"model-dir": { type: "string" },
		help: { type: "boolean", short: "h", default: false },
	},
});

if (args.help) {
	console.log(USAGE);
	process.exit(0);
}

const int = (name: string, value: string | undefined) => {
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0) {
		console.error(`--${name} must be a non-negative integer`);
		process.exit(2);
	}
	return n;
};
if (args.prompt !== "compact" && args.prompt !== "detailed") {
	console.error("--prompt must be compact or detailed");
	process.exit(2);
}
const config = {
	width: int("width", args.width),
	height: int("height", args.height),
	seed: int("seed", args.seed),
	initialLength: int("initial-length", args["initial-length"]),
	steps: int("steps", args.steps),
	warmup: int("warmup", args.warmup),
	threads: (args.threads ?? "0").split(",").map((t) => int("threads", t)),
	prompt: args.prompt as PromptStyle,
	guarded: !args.unassisted,
	fps: args.fps === undefined ? undefined : int("fps", args.fps),
	repo: args.repo ?? "receptron/laya-onnx",
	modelDir: args["model-dir"],
};

if (args.output && (await Bun.file(args.output).exists())) {
	console.error(`${args.output} already exists — not overwriting`);
	process.exit(2);
}

/** Plays games back to back (new seed after a death or a full board). */
function games() {
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

async function runHeadless() {
	const results = [];
	for (const threads of config.threads) {
		process.stderr.write(
			`threads=${threads === 0 ? "default" : threads}: loading model… `,
		);
		const laya = await loadLaya({
			repo: config.repo,
			modelDir: config.modelDir,
			threads,
		});
		process.stderr.write(`${(laya.loadMs / 1000).toFixed(1)}s, warming up… `);

		const play = games();
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
			threads,
			loadMs: Math.round(laya.loadMs),
			steps: config.steps,
			inferenceMs: summarize(inference),
			decisionMs: summarize(decisionTimes),
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
		runtime: { bun: Bun.version, transport: "in-process onnxruntime-node" },
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
	if (args.output) {
		await Bun.write(args.output, `${JSON.stringify(report, null, "\t")}\n`);
		console.log(`report: ${args.output}`);
	}
}

async function runLive() {
	const color = !process.env.NO_COLOR;
	const threads = config.threads[0] ?? 0;
	process.stdout.write("loading Laya (in-process)…\n");
	const laya = await loadLaya({
		repo: config.repo,
		modelDir: config.modelDir,
		threads,
	});

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

	const play = games();
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

if (args.headless) await runHeadless();
else await runLive();
