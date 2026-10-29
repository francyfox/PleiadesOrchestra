import { defineCommand, option } from "@bunli/core";
import { z } from "zod";
import { createHarnessClient } from "../harness-client.ts";
import { formatUsageSummary } from "../usage-summary.ts";

/** `--agent` -> the orchestrator's agent id; `orchestrator` is the whole planner (the default). */
const AGENTS = {
	alpha: "alpha-understand",
	beta: "beta-text",
	gamma: "gamma-decision",
	delta: "delta-function-call",
} as const;

export default defineCommand({
	name: "send",
	description: "Send a message to harness and stream the reply",
	options: {
		message: option(z.string().min(1), {
			description: "Message text",
			short: "m",
		}),
		thread: option(z.string().default("cli"), {
			description: "Thread id",
			short: "t",
		}),
		user: option(z.string().default("cli-user"), {
			description: "User id",
			short: "u",
		}),
		agent: option(
			z
				.enum([
					"orchestrator",
					...(Object.keys(AGENTS) as (keyof typeof AGENTS)[]),
				])
				.default("orchestrator"),
			{
				description:
					"orchestrator (planner, default) or one agent's model alone: alpha, beta, delta (chat), gamma (a decision about the message)",
				short: "a",
			},
		),
		question: option(z.string().optional(), {
			description:
				"gamma: the question about the message (yes/no without --options)",
			short: "q",
		}),
		options: option(z.string().optional(), {
			description: "gamma: comma-separated options, makes it a choice",
		}),
		url: option(
			z.url().default(process.env.HARNESS_BASE_URL ?? "http://localhost:3000"),
			{
				description: "harness base URL",
			},
		),
	},
	handler: async ({ flags }) => {
		const apiKey = process.env.HARNESS_API_KEY;
		if (!apiKey) {
			console.error("HARNESS_API_KEY is not set.");
			process.exit(1);
		}

		const client = createHarnessClient({ baseURL: flags.url, apiKey });
		if (flags.agent !== "orchestrator") {
			const agent = AGENTS[flags.agent];
			try {
				if (agent === "gamma-decision") {
					if (!flags.question) {
						console.error("--agent gamma needs --question.");
						process.exit(1);
					}
					const options = flags.options
						?.split(",")
						.map((o) => o.trim())
						.filter(Boolean);
					const answers = await client.decide(flags.message, {
						answer: options?.length
							? {
									type: "choice",
									instructions: flags.question,
									criteria: Object.fromEntries(options.map((o) => [o, o])),
								}
							: { type: "boolean", instructions: flags.question },
					});
					console.log(JSON.stringify(answers.answer, null, 2));
				} else {
					const answer = await client.complete(agent, flags.message);
					console.log(answer.text);
					process.stderr.write(
						`${agent} · in ${answer.inputTokens ?? "?"} · out ${answer.outputTokens ?? "?"}\n`,
					);
				}
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exit(1);
			}
			return;
		}

		const contextWindowTokens = process.env.LLM_CONTEXT_SIZE
			? Number(process.env.LLM_CONTEXT_SIZE)
			: undefined;

		try {
			const requestStartedAt = Date.now();
			let firstDeltaAt: number | undefined;
			let progressCleared = false;

			for await (const event of client.streamMessage({
				threadId: flags.thread,
				userId: flags.user,
				text: flags.message,
			})) {
				switch (event.type) {
					case "progress":
						process.stderr.write(
							`\r[${event.chunkIndex + 1}/${event.totalChunks}] ${event.elapsedMs}ms  `,
						);
						break;
					case "delta":
						if (!progressCleared) {
							process.stderr.write("\r\x1b[K");
							progressCleared = true;
						}
						firstDeltaAt ??= Date.now();
						process.stdout.write(event.text);
						break;
					case "done": {
						process.stdout.write("\n");
						const ttftMs = firstDeltaAt
							? firstDeltaAt - requestStartedAt
							: undefined;
						const usageLine = formatUsageSummary(event, contextWindowTokens);
						process.stderr.write(
							ttftMs !== undefined
								? `TTFT ${ttftMs}ms · ${usageLine}\n`
								: `${usageLine}\n`,
						);
						break;
					}
				}
			}
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	},
});
