import { defineCommand, option } from "@bunli/core";
import { z } from "zod";
import { createHarnessClient } from "../harness-client.ts";

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
						process.stdout.write(event.text);
						break;
					case "done":
						process.stdout.write("\n");
						break;
				}
			}
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	},
});
