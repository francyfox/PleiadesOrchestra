import { mkdirSync, writeFileSync } from "node:fs";
import { defineCommand, option } from "@bunli/core";
import { colors } from "@bunli/utils";
import { z } from "zod";
import { config } from "../config/config.service.ts";
import { DELTA_MODEL } from "../delta/delta.model.ts";
import { connectServer, startServer } from "../delta/delta.server.ts";
import { createDelta } from "../delta/delta.ts";
import { loadLaya } from "../laya/laya.ts";
import type { LoadedLaya } from "../laya/laya.types.ts";
import { COMPLEX_CASES } from "./tools.cases.ts";
import { runComplex, summarizeComplex } from "./tools.service.ts";
import type { ComplexResult } from "./tools.types.ts";
import { legend, renderComplexCase, renderComplexTable } from "./tools.view.ts";

// How well delta's model fills in a tool call's arguments (models.ts), on the
// complex cases (tools.cases.ts): one request per kind of site that needs a query,
// keywords chosen by meaning, an enum, a boolean and a number at once. Field
// by field (delta.service.ts); shown as request → arguments with the source words
// coloured by kind, then one table.
//
//   bun tools [--laya] [--laya-threads N] [--threads N] [--gpu]
//             [--output results/x.json]
//
// --laya: enums and booleans go to Laya (laya.ts), delta fills the rest.
// In this process on CPU, or over HTTP when LAYA_BASE_URL is set (.env).
//
// CPU by default, 4 threads: GPU numbers only mean something on a machine
// whose GPU holds the whole model (the dev iGPU has 0.5 GB). Requests are in
// English: the translator turns the message into English before delta sees it.
//
// DELTA_BASE_URL (+ DELTA_API_KEY, DELTA_MODEL) in .env runs the cases
// against an OpenAI-compatible server already up elsewhere (delta's
// llama-server, Ollama); --threads and --gpu then don't apply.

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
		laya: flag("Enums and booleans by Laya, the rest by delta"),
		"laya-threads": option(z.coerce.number().int().min(0).default(4), {
			description: "onnxruntime threads for Laya (0 = its default; default 4)",
		}),
		"laya-repo": option(z.string().default("receptron/laya-onnx"), {
			description: "Hugging Face repo of Laya's ONNX bundle",
		}),
		threads: option(z.coerce.number().int().min(1).default(4), {
			description: "CPU threads for llama-server (default 4)",
		}),
		gpu: flag(
			"Offload to the GPU (Vulkan); only where the whole model fits in VRAM",
		),
		output: option(z.string().optional(), {
			description: "Save the results as JSON, e.g. results/x.json",
		}),
	},
	handler: async ({ flags }) => {
		const { threads, gpu, output } = flags;
		const layaThreads = flags["laya-threads"];
		const gpuLayers = gpu ? 99 : 0;
		const remote = config.DELTA_BASE_URL;
		const model = (remote && config.DELTA_MODEL) || DELTA_MODEL.id;
		const id = flags.laya ? `${model} + Laya` : model;

		process.stderr.write(`🧪 ${COMPLEX_CASES.length} cases\n`);
		const progress = progressLine();
		let laya: LoadedLaya | undefined;
		let results: ComplexResult[] = [];
		try {
			if (flags.laya) {
				if (!config.LAYA_BASE_URL)
					progress.update(`🧠 Loading Laya (${layaThreads} threads)`);
				laya = await loadLaya({
					baseUrl: config.LAYA_BASE_URL,
					apiKey: config.LAYA_API_KEY,
					repo: flags["laya-repo"],
					threads: layaThreads,
				});
			}
			progress.update(
				remote
					? `🔌 Connecting to ${remote}`
					: `🚀 Starting ${model} (${gpu ? "GPU" : `CPU, ${threads} threads`})`,
			);
			const server = remote
				? await connectServer({
						baseUrl: remote,
						apiKey: config.DELTA_API_KEY,
						model: config.DELTA_MODEL,
					})
				: await startServer(DELTA_MODEL, {
						gpuLayers,
						threads,
						contextSize: 4096,
					});
			try {
				results = await runComplex(
					createDelta({ endpoint: server }),
					COMPLEX_CASES,
					{
						laya,
						onCase: (at, total, caseId) =>
							progress.update(`⏳ ${at}/${total} ${caseId}`),
					},
				);
			} finally {
				await server.stop();
			}
			progress.done(`✅ ${id}: done`);
		} catch (error) {
			progress.done(`💥 ${error instanceof Error ? error.message : error}`);
			process.exitCode = 1;
			return;
		} finally {
			await laya?.close();
		}

		const summary = summarizeComplex(results);
		console.log(`\n${colors.bold("🧩 Request → arguments")}  ${legend()}\n`);
		console.log(
			COMPLEX_CASES.map((testCase, i) => {
				const result = results[i];
				return result ? renderComplexCase(testCase, result) : "";
			}).join("\n\n"),
		);
		console.log(renderComplexTable(id, summary));

		if (output) {
			mkdirSync("results", { recursive: true });
			writeFileSync(
				output,
				JSON.stringify(
					{
						at: new Date().toISOString(),
						model: id,
						// Remote: the server's own settings, not the flags.
						server: remote ?? "local",
						gpuLayers: remote ? undefined : gpuLayers,
						threads: remote ? undefined : threads,
						laya: !flags.laya
							? undefined
							: config.LAYA_BASE_URL
								? { server: config.LAYA_BASE_URL }
								: { threads: layaThreads, loadMs: laya?.loadMs },
						summary,
						results,
					},
					null,
					2,
				),
			);
			process.stderr.write(`\n💾 ${colors.dim(`wrote ${output}`)}\n`);
		}
	},
});
