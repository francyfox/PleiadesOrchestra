import { defineCommand, option } from "@bunli/core";
import { z } from "zod";
import { createHarnessClient } from "../harness-client.ts";

export default defineCommand({
	name: "reset",
	description: "Reset a thread's conversation history",
	options: {
		thread: option(z.string().default("cli"), {
			description: "Thread id",
			short: "t",
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

		try {
			await client.resetThread(flags.thread);
			console.log(`Thread "${flags.thread}" reset.`);
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	},
});
