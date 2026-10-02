import { mkdirSync, writeFileSync } from "node:fs";
import { buildCases, type Lang } from "./cases.ts";
import { startServer } from "./llama.ts";
import { CANDIDATES } from "./models.ts";
import type { PromptVersion } from "./prompt.ts";
import {
	type CaseResult,
	type Mode,
	type Row,
	rowsFor,
	runCases,
} from "./run.ts";

// Which tiny model is the smallest that can fill in a tool call's arguments?
//
//   bun --cwd apps/tools-benchmark start [--models id,id] [--modes schema,native]
//        [--langs en,ru] [--prompt v1|v2] [--sanitize] [--cpu] [--verbose]
//        [--output results/x.json]
//
// `en` is the request as Vikhr would translate it; `ru` is the raw message.

function flag(name: string): string | undefined {
	const at = process.argv.indexOf(`--${name}`);
	return at === -1 ? undefined : (process.argv[at + 1] ?? "");
}
const has = (name: string) => process.argv.includes(`--${name}`);
const list = (name: string, fallback: string[]) =>
	flag(name)?.split(",").filter(Boolean) ?? fallback;

const modelIds = list(
	"models",
	CANDIDATES.map((c) => c.id),
);
const modes = list("modes", ["schema", "native"]) as Mode[];
const langs = list("langs", ["en", "ru"]) as Lang[];
const gpuLayers = has("cpu") ? 0 : 99;
const verbose = has("verbose");
const prompt = (flag("prompt") ?? "v1") as PromptVersion;
const sanitize = has("sanitize");

const cases = buildCases(langs);
const rows: Row[] = [];
const failures: { model: string; mode: Mode; result: CaseResult }[] = [];

for (const id of modelIds) {
	const candidate = CANDIDATES.find((c) => c.id === id);
	if (!candidate) throw new Error(`unknown model ${id}`);
	console.error(`\n== ${id} (${gpuLayers ? "GPU" : "CPU"}) ==`);
	const server = await startServer(candidate, {
		gpuLayers,
		threads: 6,
		contextSize: 4096,
	});
	try {
		for (const mode of modes) {
			console.error(`   mode ${mode} …`);
			const results = await runCases(server.baseUrl, candidate, cases, mode, {
				prompt,
				sanitize,
			});
			rows.push(...rowsFor(id, mode, results, langs));
			for (const result of results) {
				if (!result.ok) failures.push({ model: id, mode, result });
			}
		}
	} finally {
		await server.stop();
	}
}

const pct = (value: number) => `${(value * 100).toFixed(0)}%`.padStart(4);
console.log(
	"\nmodel                mode    lang  cases  correct  valid  p50 ms  p90 ms  prompt tok  out tok",
);
for (const row of rows) {
	const s = row.summary;
	console.log(
		[
			row.model.padEnd(20),
			row.mode.padEnd(7),
			row.lang.padEnd(5),
			String(s.cases).padStart(5),
			pct(s.accuracy).padStart(8),
			pct(s.valid).padStart(6),
			s.p50Ms.toFixed(0).padStart(7),
			s.p90Ms.toFixed(0).padStart(7),
			row.meanPromptTokens.toFixed(0).padStart(11),
			row.meanOutputTokens.toFixed(0).padStart(8),
		].join(" "),
	);
}

if (verbose) {
	console.log("\nFailures:");
	for (const { model, mode, result } of failures) {
		console.log(
			`${model} ${mode} ${result.id}: ${result.reason} — got ${JSON.stringify(result.actual)}`,
		);
	}
}

const output = flag("output");
if (output) {
	mkdirSync("results", { recursive: true });
	writeFileSync(
		output,
		JSON.stringify(
			{
				at: new Date().toISOString(),
				gpuLayers,
				prompt,
				sanitize,
				rows,
				failures,
			},
			null,
			2,
		),
	);
	console.error(`\nwrote ${output}`);
}
