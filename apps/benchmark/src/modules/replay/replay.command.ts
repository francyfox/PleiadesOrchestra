import { basename } from "node:path";
import { defineCommand, option } from "@bunli/core";
import { repairArguments } from "@repo/core";
import { z } from "zod";
import { config } from "../config/config.service.ts";
import { createMockShop } from "../efficiency/efficiency.shop.ts";
import { summarizeLatency } from "../stats/stats.service.ts";
import {
	callKey,
	groupByModel,
	replayedLatency,
	sameArguments,
} from "./replay.service.ts";
import type { RecordedRun, ReplayCall } from "./replay.types.ts";

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

export default defineCommand({
	name: "replay",
	description:
		"Times an orchestrator run of `bun efficiency` model by model on warm local models: no model swap in the time",
	options: {
		dir: option(z.string().min(1), {
			description: "The run folder of `bun efficiency` (its orchestra/*.json)",
		}),
		delta: option(z.string().optional(), {
			description:
				"Another model for delta: each recorded tool-argument call is asked again on it (same prompt and schema) and a run counts as done only if every answer matches the recorded one",
		}),
	},
	handler: async ({ flags }) => {
		const baseURL = config.REPLAY_BASE_URL;
		if (!baseURL) {
			console.error(
				"REPLAY_BASE_URL is not set (the local models' server, with /v1).",
			);
			process.exit(1);
		}
		const runs: RecordedRun[] = [];
		for await (const path of new Bun.Glob(
			`${flags.dir}/orchestra/*.json`,
		).scan()) {
			const run = (await Bun.file(path).json()) as RecordedRun;
			// Infrastructure errors have no meaningful time; the file name is unique, the case id is not.
			if (run.status !== "error" && run.detail?.llmCalls)
				runs.push({ ...run, id: basename(path, ".json") });
		}

		// One generation of exactly the recorded output length: the same work, whatever the text.
		const time = async (call: ReplayCall, schema?: unknown) => {
			const startedAt = performance.now();
			const response = await fetch(`${baseURL}/chat/completions`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...(config.REPLAY_API_KEY
						? { authorization: `Bearer ${config.REPLAY_API_KEY}` }
						: {}),
				},
				body: JSON.stringify({
					model: call.model,
					messages: JSON.parse(call.prompt as string),
					temperature: 0,
					// A delta call on another model: its own answer, as delta asks for it.
					...(schema
						? {
								max_tokens: 256,
								response_format: {
									type: "json_schema",
									json_schema: { name: "arguments", schema },
								},
							}
						: {
								max_tokens: Math.max(1, call.outputTokens ?? 1),
								ignore_eos: true,
							}),
				}),
			});
			if (!response.ok)
				throw new Error(
					`${call.model}: HTTP ${response.status} ${await response.text()}`,
				);
			const body = (await response.json()) as {
				choices?: { message?: { content?: string } }[];
			};
			return {
				ms: performance.now() - startedAt,
				text: body.choices?.[0]?.message?.content ?? "",
			};
		};

		// The shop's tool schemas: a call named after one is a delta call.
		const schemas = new Map(
			(await createMockShop(1).listTools()).tools.map((tool) => [
				tool.name,
				tool.inputSchema,
			]),
		);
		const mismatches: string[] = [];
		const failedRuns = new Set<string>();
		if (flags.delta) {
			for (const run of runs)
				run.detail.llmCalls = run.detail.llmCalls.map((call) =>
					call.prompt && call.actionName && schemas.has(call.actionName)
						? { ...call, model: flags.delta as string }
						: call,
				);
		}

		const replayed = new Map<string, number>();
		const perModel: string[] = [];
		for (const [model, calls] of groupByModel(runs)) {
			// The first call loads the model (a swap): run it once untimed.
			const [first] = calls;
			const schemaOf = (call: ReplayCall) =>
				model === flags.delta ? schemas.get(call.actionName ?? "") : undefined;
			if (first) await time(first, schemaOf(first));
			const samples: number[] = [];
			for (const call of calls) {
				const schema = schemaOf(call);
				const { ms, text } = await time(call, schema);
				replayed.set(callKey(call.run, call.index), ms);
				samples.push(ms);
				if (schema) {
					const asked = repairArguments(text, schema as never);
					const recorded = repairArguments(
						call.response ?? "",
						schema as never,
					);
					if (!sameArguments(asked, recorded)) {
						failedRuns.add(call.run);
						mismatches.push(
							`  ${call.run} ${call.actionName}: ${JSON.stringify(recorded)} -> ${JSON.stringify(asked)}`,
						);
					}
				}
			}
			const s = summarizeLatency(samples);
			perModel.push(
				`  ${model}: ${calls.length} calls, p50 ${Math.round(s.p50)} ms, mean ${Math.round(s.mean)} ms`,
			);
			console.log(perModel.at(-1));
		}

		const warm = summarizeLatency(
			runs.map((run) => replayedLatency(run, replayed)),
		);
		const recorded = summarizeLatency(runs.map((run) => run.latencyMs));
		const ok = runs.filter((run) => run.ok && !failedRuns.has(run.id)).length;
		const report = [
			`Replay of ${flags.dir} at ${new Date().toISOString()} on ${baseURL}`,
			"Every language-model call replayed on a warm model (grouped by model, the first call of a model untimed), generating its recorded output length; code, tools and decision calls kept as recorded.",
			"",
			`case runs  ${runs.length}`,
			`success    ${Math.round((ok / runs.length) * 100)}% (${ok}/${runs.length}; the recorded run${flags.delta ? `, minus runs where ${flags.delta} answered a delta call differently` : ""})`,
			`latency p50  ${seconds(warm.p50)} warm  (${seconds(recorded.p50)} recorded, model swaps included)`,
			`latency mean ${seconds(warm.mean)} warm  (${seconds(recorded.mean)} recorded)`,
			"",
			"model calls (warm):",
			...perModel,
			...(flags.delta
				? [
						"",
						`delta answers of ${flags.delta} unlike the recorded ones: ${mismatches.length}`,
						...mismatches,
					]
				: []),
		].join("\n");
		console.log(`\n${report}`);
		await Bun.write(`${flags.dir}/replay.txt`, `${report}\n`);
		console.log(`\n💾 wrote ${flags.dir}/replay.txt`);
	},
});
