import { mkdirSync, writeFileSync } from "node:fs";
import { defineCommand, option } from "@bunli/core";
import { colors } from "@bunli/utils";
import { z } from "zod";
import { config } from "../config/config.service.ts";
import { createDelta } from "../delta/delta.ts";
import { progressLine } from "../report/report.view.ts";
import { COMPLEX_CASES } from "../tools/tools.cases.ts";
import { runComplex, summarizeComplex } from "../tools/tools.service.ts";
import type { ComplexSummary } from "../tools/tools.types.ts";
import { renderComplexComparison } from "../tools/tools.view.ts";
import { hostedEndpoint, parseModels } from "./openrouter.service.ts";

// Delta's job (filling a tool call's arguments, tools.cases.ts, field by field)
// on hosted models behind OpenRouter, side by side, one column per model:
//
//   bun openrouter [--models a/b,c/d] [--output results/x.json]
//
// OPENROUTER_API_KEY in .env. A model that fails (no provider with
// json_schema, rate limit, …) shows 💥 and the others go on. A few cents in all.

export default defineCommand({
	name: "openrouter",
	description: "Delta on OpenRouter: tool call arguments across hosted models",
	options: {
		models: option(z.string().optional(), {
			description:
				"Comma-separated OpenRouter model ids (default: 4 candidates)",
		}),
		output: option(z.string().optional(), {
			description: "Save the results as JSON, e.g. results/x.json",
		}),
	},
	handler: async ({ flags }) => {
		const apiKey = config.OPENROUTER_API_KEY;
		if (!apiKey) {
			console.error("OPENROUTER_API_KEY is not set (apps/benchmark/.env).");
			process.exitCode = 1;
			return;
		}
		const models = parseModels(flags.models);
		const progress = progressLine();
		const summaries: (ComplexSummary | undefined)[] = [];
		const failures: string[] = [];

		for (const [at, model] of models.entries()) {
			try {
				const results = await runComplex(
					createDelta({ endpoint: hostedEndpoint(model, apiKey) }),
					COMPLEX_CASES,
					{
						onCase: (done, total, id) =>
							progress.update(
								`⏳ ${model} (${at + 1}/${models.length}) ${done}/${total} ${id}`,
							),
					},
				);
				summaries.push(summarizeComplex(results));
				progress.done(`✅ ${model}`);
			} catch (error) {
				summaries.push(undefined);
				failures.push(
					`${model}: ${error instanceof Error ? error.message : error}`,
				);
				progress.done(`💥 ${model}`);
			}
		}

		console.log(renderComplexComparison(models, summaries));
		for (const failure of failures) console.log(colors.dim(`  💥 ${failure}`));

		if (flags.output) {
			mkdirSync("results", { recursive: true });
			writeFileSync(
				flags.output,
				JSON.stringify(
					{
						at: new Date().toISOString(),
						server: "openrouter",
						models,
						summaries,
						failures,
					},
					null,
					2,
				),
			);
			process.stderr.write(`\n💾 ${colors.dim(`wrote ${flags.output}`)}\n`);
		}
		if (failures.length === models.length) process.exitCode = 1;
	},
});
