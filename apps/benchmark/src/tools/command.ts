import { mkdirSync, writeFileSync } from "node:fs";
import { defineCommand, option } from "@bunli/core";
import { z } from "zod";
import { buildCases } from "./cases.ts";
import { deltaCases } from "./laya.ts";
import { startServer } from "./llama.ts";
import { DELTA_MODEL } from "./models.ts";
import { type Failure, renderFailures, renderTable } from "./report.ts";
import { type Row, rowsFor, runCases } from "./run.ts";

// How well delta's model fills in a tool call's arguments (models.ts).
//
//   bun tools [--modes schema,native] [--sanitize] [--fields] [--per-field]
//             [--threads N] [--gpu] [--verbose] [--output results/x.json]
//
// CPU by default, 4 threads: GPU numbers only mean something on a machine
// whose GPU holds the whole model (the dev iGPU has 0.5 GB).
//
// `schema` is how delta runs in production; `native` is the model's own
// tool-call format, for comparison. Requests are in English: the translator
// turns the message into English before delta sees it.

/**
 * Progress on one stderr line, rewritten in place in a terminal. Not bunli's
 * spinner: it takes over the whole screen (OpenTUI), which wiped the results
 * table and cut emoji to one cell.
 */
function progressLine() {
	const tty = process.stderr.isTTY;
	const started = performance.now();
	const elapsed = () => `${((performance.now() - started) / 1000).toFixed(0)}s`;
	return {
		update(text: string) {
			if (tty) process.stderr.write(`\r\x1b[K${text} (${elapsed()})`);
		},
		done(text: string) {
			process.stderr.write(`${tty ? "\r\x1b[K" : ""}${text} (${elapsed()})\n`);
		},
	};
}

const flag = (description: string) =>
	option(z.boolean().default(false), { description, argumentKind: "flag" });

export default defineCommand({
	name: "tools",
	description: "Delta: how well its model fills in tool call arguments",
	options: {
		modes: option(
			z
				.string()
				.default("schema")
				.transform((value) => value.split(",").filter(Boolean))
				.pipe(z.array(z.enum(["schema", "native"])).min(1)),
			{ description: "schema (production), native, or both: schema,native" },
		),
		sanitize: flag("Drop optional arguments the request gives no reason for"),
		fields: flag("Spell the tool's schema out in the prompt (fields.ts)"),
		"per-field": flag(
			"Arguments in parts: which optional fields, then one call per field",
		),
		threads: option(z.coerce.number().int().min(1).default(4), {
			description: "CPU threads for llama-server (default 4)",
		}),
		gpu: flag(
			"Offload to the GPU (Vulkan); only where the whole model fits in VRAM",
		),
		verbose: flag("List every miss"),
		output: option(z.string().optional(), {
			description: "Save rows and misses as JSON, e.g. results/x.json",
		}),
	},
	handler: async ({ flags, colors }) => {
		const { modes, sanitize, fields, threads, gpu, verbose, output } = flags;
		const perField = flags["per-field"];
		if (perField && modes.some((mode) => mode !== "schema"))
			throw new Error("--per-field needs --modes schema");
		const gpuLayers = gpu ? 99 : 0;

		// Only what delta does in production: fields Laya picks are left out (laya.ts).
		const allCases = buildCases();
		const cases = deltaCases(allCases);
		process.stderr.write(
			`🧪 ${cases.length} cases ${colors.dim(`(${allCases.length - cases.length} left out: Laya picks those fields)`)}\n`,
		);

		const id = DELTA_MODEL.id;
		const progress = progressLine();
		progress.update(
			`🚀 Starting ${id} (${gpu ? "GPU" : `CPU, ${threads} threads`})`,
		);
		const rows: Row[] = [];
		const failures: Failure[] = [];
		try {
			const server = await startServer(DELTA_MODEL, {
				gpuLayers,
				threads,
				contextSize: 4096,
			});
			try {
				for (const mode of modes) {
					const results = await runCases(server.baseUrl, cases, mode, {
						sanitize,
						fields,
						perField,
						onCase: (at, total, caseId) =>
							progress.update(`⏳ ${mode} ${at}/${total} ${caseId}`),
					});
					rows.push(...rowsFor(id, mode, results));
					for (const result of results) {
						if (!result.ok) failures.push({ model: id, mode, result });
					}
				}
			} finally {
				await server.stop();
			}
			progress.done(`✅ ${id}: ${modes.join(", ")} done`);
		} catch (error) {
			progress.done(`💥 ${error instanceof Error ? error.message : error}`);
			process.exitCode = 1;
			return;
		}

		console.log(renderTable(rows));
		if (verbose) console.log(renderFailures(failures));

		if (output) {
			mkdirSync("results", { recursive: true });
			writeFileSync(
				output,
				JSON.stringify(
					{
						at: new Date().toISOString(),
						gpuLayers,
						threads,
						// The @repo/core messages; older results say "v1"/"v2" (the copies it replaced).
						prompt: "core",
						sanitize,
						fields,
						perField,
						rows,
						failures,
					},
					null,
					2,
				),
			);
			process.stderr.write(`\n💾 ${colors.dim(`wrote ${output}`)}\n`);
		}
	},
});
