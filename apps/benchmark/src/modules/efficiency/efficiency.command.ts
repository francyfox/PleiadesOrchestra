import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineCommand, option } from "@bunli/core";
import { colors } from "@bunli/utils";
import { z } from "zod";
import { config } from "../config/config.service.ts";
import { resultPath } from "../report/report.service.ts";
import { progressLine } from "../report/report.view.ts";
import { createBetaContender } from "./efficiency.beta.ts";
import { buildCases } from "./efficiency.cases.ts";
import { checkInfrastructure } from "./efficiency.infra.ts";
import { createOrchestraContender } from "./efficiency.orchestra.ts";
import {
	loadPrices,
	priceOf,
	runContender,
	summarizeContender,
} from "./efficiency.service.ts";
import { agentLine, createOrchestraSettings } from "./efficiency.settings.ts";
import { createMockShop } from "./efficiency.shop.ts";
import type { CaseRun, Contender } from "./efficiency.types.ts";
import { renderReport } from "./efficiency.view.ts";

// Beta alone (its model + the shop's tools, a plain agent loop) against the
// orchestrator with beta (GOAP, Laya, delta), on the same seeded mock shop
// (efficiency.shop.ts) and the same cases: success, time, steps, tokens, cost.
//
//   bun efficiency [--runs N] [--seed N] [--price-in X --price-out Y] [--max-steps N]
//                  [--concurrency N] [--output results/x]
//
// Both go through the orchestrator (ORCHESTRA_* in .env): beta alone through
// its POST /v1/chat/completions (the reply model in effect), so the text model
// is the same on both sides. Every contender runs all cases --runs times and the
// report shows averages. Writes results/efficiency/
// <timestamp>/ (report.txt, and beta-alone/ and orchestra/ with one
// <iteration>-<case>.json per case run: the shop's tool calls, detail), both
// written as the bench goes. With the
// admin key the orchestrator's text models run at temperature 0 meanwhile
// (restored afterwards, also on SIGINT/SIGTERM).

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
		runs: option(z.coerce.number().int().min(1).default(6), {
			description: "Passes over all the cases per contender (default 6)",
		}),
		"max-steps": option(z.coerce.number().int().min(1).default(8), {
			description: "Model calls beta alone may make per case (default 8)",
		}),
		concurrency: option(z.coerce.number().int().min(1).default(1), {
			description:
				"Case runs of one contender at a time (default 1; latency then includes contention)",
		}),
		output: option(z.string().optional(), {
			description:
				"The run folder (default results/efficiency/<timestamp>/): report.txt and beta-alone/, orchestra/ with one JSON file per case run",
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

		try {
			await checkInfrastructure({
				baseUrl: base,
				apiKey: config.ORCHESTRA_API_KEY,
			});
		} catch (error) {
			console.error((error as Error).message);
			process.exitCode = 1;
			return;
		}

		const cases = buildCases(createMockShop(flags.seed).catalog);
		const progress = progressLine();
		const setup: string[] = [];
		const runsOf = contenders.map((): CaseRun[] => []);

		// One folder per run: report.txt and a JSON file per case run in a folder per contender.
		const dir =
			flags.output ?? resultPath("efficiency", "x").replace(/\.x$/, "");
		const output = join(dir, "report.txt");
		const folders = ["beta-alone", "orchestra"].map((name) => join(dir, name));
		for (const folder of folders) mkdirSync(folder, { recursive: true });

		// The report of what is done so far, rewritten after every iteration and at the end.
		const writeReport = () => {
			const beta = runsOf[0]?.find((run) => run.model)?.model;
			const report = renderReport({
				at: new Date().toISOString(),
				seed: flags.seed,
				price,
				setup: [
					...(beta ? [`beta alone: ${beta}, temperature 0`] : []),
					...setup,
				],
				summaries: contenders.map((contender, at) =>
					summarizeContender(contender, runsOf[at] ?? [], flags.runs),
				),
			});
			writeFileSync(output, report);
			return report;
		};

		// Pin the orchestrator's text models to temperature 0 for the run.
		let restore = async () => {};
		const admin = config.ORCHESTRA_ADMIN_API_KEY;
		if (admin && contenders.length > 1) {
			const settings = createOrchestraSettings({
				baseUrl: base,
				adminApiKey: admin,
			});
			const before = await settings.agents();
			restore = await settings.freeze();
			const during = await settings.agents();
			setup.push(
				"orchestra + beta:",
				...during.map((one, i) => `  ${agentLine(before[i] ?? one, one)}`),
			);
		} else if (contenders.length > 1)
			setup.push(
				"orchestra + beta: models not read and temperatures unchanged (ORCHESTRA_ADMIN_API_KEY unset)",
			);
		const onSignal = (signal: NodeJS.Signals) => {
			try {
				writeReport();
			} catch {}
			restore().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
		};
		process.once("SIGINT", onSignal);
		process.once("SIGTERM", onSignal);

		let stopped = false;
		try {
			for (const [at, contender] of contenders.entries()) {
				const total = cases.length * flags.runs;
				const result = await runContender({
					contender,
					cases,
					iterations: flags.runs,
					concurrency: flags.concurrency,
					newShop: (test) => {
						// A fresh shop per case: one case's cart never leaks into the next.
						const shop = createMockShop(flags.seed);
						shop.fill(test.start);
						return shop;
					},
					onResult: ({ order, iteration, test, run, shop }, runs) => {
						runsOf[at] = runs;
						writeFileSync(
							join(folders[at] as string, `${iteration}-${test.id}.json`),
							JSON.stringify(
								{
									contender: contender.name,
									order,
									iteration,
									lang: test.lang,
									text: test.text,
									...run,
									shopCalls: shop.calls(),
									cart: shop.cart(),
								},
								null,
								"\t",
							),
						);
						progress.update(
							`⏳ ${contender.name} ${runs.length}/${total} (${iteration}/${flags.runs} ${test.id})`,
						);
						if (runs.length % cases.length === 0) writeReport();
					},
				});
				runsOf[at] = result.runs;
				if (result.stopped) {
					stopped = true;
					progress.done(
						`⛔ ${contender.name}: 5 case runs in a row hit infrastructure errors, run stopped`,
					);
					break;
				}
				progress.done(`✅ ${contender.name}`);
			}
		} finally {
			process.off("SIGINT", onSignal);
			process.off("SIGTERM", onSignal);
			await restore();
			console.log(writeReport());
		}

		process.stderr.write(`💾 ${colors.dim(`wrote ${dir}`)}\n`);
		if (stopped) process.exitCode = 1;
	},
});
