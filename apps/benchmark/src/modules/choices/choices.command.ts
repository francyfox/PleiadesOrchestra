import { mkdirSync, writeFileSync } from "node:fs";
import { defineCommand, option } from "@bunli/core";
import { colors } from "@bunli/utils";
import { z } from "zod";
import { config } from "../config/config.service.ts";
import { layaArguments, layaQuestions } from "../laya/laya.service.ts";
import { loadLaya } from "../laya/laya.ts";
import type { LoadedLaya } from "../laya/laya.types.ts";
import { LAYA_CASES } from "./choices.cases.ts";
import { judgeChoices, summarizeLaya } from "./choices.service.ts";
import type { LayaResult } from "./choices.types.ts";
import { renderLayaCase, renderLayaTable } from "./choices.view.ts";

// How well Laya fills a request's enums and booleans — its share of
// `tools --laya` (laya.service.ts: same questions, same answer → argument rules).
//
//   bun laya [--threads N] [--output results/x.json]
//
// In this process on CPU, or over HTTP when LAYA_BASE_URL is set (.env).

export default defineCommand({
	name: "laya",
	description: "Laya: how well it picks enum values and yes/no fields",
	options: {
		threads: option(z.coerce.number().int().min(0).default(4), {
			description:
				"onnxruntime threads, in-process only (0 = its default; default 4)",
		}),
		repo: option(z.string().default("receptron/laya-onnx"), {
			description: "Hugging Face repo of Laya's ONNX bundle",
		}),
		output: option(z.string().optional(), {
			description: "Save the results as JSON, e.g. results/x.json",
		}),
	},
	handler: async ({ flags }) => {
		const server = config.LAYA_BASE_URL;
		const run = server
			? `Laya @ ${new URL(server).host}`
			: `Laya CPU ×${flags.threads}`;
		process.stderr.write(`🧪 ${LAYA_CASES.length} requests, ${run}\n`);

		let laya: LoadedLaya;
		try {
			laya = await loadLaya({
				baseUrl: server,
				apiKey: config.LAYA_API_KEY,
				repo: flags.repo,
				threads: flags.threads,
			});
		} catch (error) {
			process.stderr.write(
				`💥 ${error instanceof Error ? error.message : error}\n`,
			);
			process.exitCode = 1;
			return;
		}

		const results: LayaResult[] = [];
		try {
			const [first] = LAYA_CASES;
			if (first) await laya.ask(first.request, layaQuestions(first.tool));
			for (const testCase of LAYA_CASES) {
				try {
					const asked = await laya.ask(
						testCase.request,
						layaQuestions(testCase.tool),
					);
					const { args } = layaArguments(testCase.tool, asked.answers);
					results.push({
						id: testCase.id,
						latencyMs: asked.latencyMs,
						answers: asked.answers,
						actual: args,
						fields: judgeChoices(testCase.tool, testCase.expected, args),
					});
				} catch (error) {
					results.push({
						id: testCase.id,
						latencyMs: 0,
						answers: {},
						actual: {},
						fields: judgeChoices(testCase.tool, testCase.expected, {}).map(
							(f) => ({
								...f,
								ok: false,
							}),
						),
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		} finally {
			await laya.close();
		}

		console.log(
			LAYA_CASES.map((testCase, i) => {
				const result = results[i];
				return result ? renderLayaCase(testCase, result) : "";
			}).join("\n\n"),
		);
		const summary = summarizeLaya(results);
		console.log(renderLayaTable(run, summary));

		if (flags.output) {
			mkdirSync("results", { recursive: true });
			writeFileSync(
				flags.output,
				JSON.stringify(
					{
						at: new Date().toISOString(),
						run,
						server: server ?? "in-process",
						threads: server ? undefined : flags.threads,
						summary,
						results,
					},
					null,
					2,
				),
			);
			process.stderr.write(`\n💾 ${colors.dim(`wrote ${flags.output}`)}\n`);
		}
	},
});
