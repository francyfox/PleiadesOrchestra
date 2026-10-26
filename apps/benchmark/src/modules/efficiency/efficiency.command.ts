import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineCommand, option } from "@bunli/core";
import { colors } from "@bunli/utils";
import { z } from "zod";
import { config } from "../config/config.service.ts";
import { progressLine } from "../report/report.view.ts";
import { createBetaContender } from "./efficiency.beta.ts";
import { buildCases } from "./efficiency.cases.ts";
import { createOrchestraContender } from "./efficiency.orchestra.ts";
import {
	judge,
	loadPrices,
	priceOf,
	summarizeContender,
} from "./efficiency.service.ts";
import { createMockShop } from "./efficiency.shop.ts";
import type { CaseRun, Contender } from "./efficiency.types.ts";
import { renderReport } from "./efficiency.view.ts";

// Beta alone (its model + the shop's tools, a plain agent loop) against the
// orchestrator with beta (GOAP, Laya, delta), on the same seeded mock shop
// (efficiency.shop.ts) and the same cases: success, time, steps, tokens, cost.
//
//   bun efficiency [--seed N] [--price-in X --price-out Y] [--max-steps N]
//                  [--output results/x.txt]
//
// Both go through the orchestrator (ORCHESTRA_* in .env): beta alone through
// its POST /v1/chat/completions (the reply model in effect), so the text model
// is the same on both sides. Writes a plain-text report (default results/efficiency-<date>.txt).

export default defineCommand({
	name: "efficiency",
	description: "Beta alone vs the orchestrator with beta on a mock shop",
	options: {
		seed: option(z.coerce.number().int().default(1), {
			description: "Faker seed of the mock shop (default 1)",
		}),
		// For a model not on OpenRouter's price list (a local one). Default:
		// meta-llama/llama-3.1-8b-instruct's listing, a hosted stand-in.
		"price-in": option(z.coerce.number().min(0).default(0.05), {
			description: "USD per 1M input tokens (default 0.05)",
		}),
		"price-out": option(z.coerce.number().min(0).default(0.08), {
			description: "USD per 1M output tokens (default 0.08)",
		}),
		"max-steps": option(z.coerce.number().int().min(1).default(8), {
			description: "Model calls beta alone may make per case (default 8)",
		}),
		output: option(z.string().optional(), {
			description:
				"Plain-text report path (default results/efficiency-<date>.txt)",
		}),
	},
	handler: async ({ flags }) => {
		const base = config.ORCHESTRA_BASE_URL;
		if (!base || !config.ORCHESTRA_API_KEY) {
			console.error(
				"Set ORCHESTRA_BASE_URL and ORCHESTRA_API_KEY (apps/benchmark/.env).",
			);
			process.exitCode = 1;
			return;
		}
		const price = { input: flags["price-in"], output: flags["price-out"] };
		const prices = priceOf(await loadPrices(), price);
		const contenders: Contender[] = [
			createBetaContender({
				baseUrl: base,
				apiKey: config.ORCHESTRA_API_KEY,
				maxSteps: flags["max-steps"],
				priceOf: prices,
			}),
		];
		if (config.ORCHESTRA_PUBLISHABLE_KEY && config.ORCHESTRA_ORIGIN)
			contenders.push(
				createOrchestraContender({
					baseUrl: base,
					publishableKey: config.ORCHESTRA_PUBLISHABLE_KEY,
					origin: config.ORCHESTRA_ORIGIN,
					adminApiKey: config.ORCHESTRA_ADMIN_API_KEY,
					priceOf: prices,
				}),
			);
		else
			console.error(
				"ORCHESTRA_PUBLISHABLE_KEY / ORCHESTRA_ORIGIN unset: beta alone only.",
			);

		const cases = buildCases(createMockShop(flags.seed).catalog);
		const progress = progressLine();
		const summaries = [];
		for (const contender of contenders) {
			const runs: CaseRun[] = [];
			for (const [at, test] of cases.entries()) {
				progress.update(
					`⏳ ${contender.name} ${at + 1}/${cases.length} ${test.id}`,
				);
				// A fresh shop per case: one case's cart never leaks into the next.
				const shop = createMockShop(flags.seed);
				shop.fill(test.start);
				const run = await contender.run(shop, test);
				runs.push({
					...run,
					ok: !run.error && judge(test, shop.cart(), run.reply),
				});
			}
			summaries.push(summarizeContender(contender, runs));
			progress.done(`✅ ${contender.name}`);
		}

		const at = new Date().toISOString();
		const report = renderReport({ at, seed: flags.seed, price, summaries });
		console.log(report);
		const output = flags.output ?? `results/efficiency-${at.slice(0, 10)}.txt`;
		mkdirSync(dirname(output), { recursive: true });
		writeFileSync(output, report);
		process.stderr.write(`💾 ${colors.dim(`wrote ${output}`)}\n`);
	},
});
