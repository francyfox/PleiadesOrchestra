import { agent } from "./agent.ts";
import { config } from "./env.ts";
import { createFetchHandler } from "./server.ts";

const server = Bun.serve({
	port: config.PORT,
	fetch: createFetchHandler({
		agent,
		apiKey: config.HARNESS_API_KEY,
		maxChunkChars: config.HARNESS_MAX_CHUNK_CHARS,
	}),
});

const signals = ["SIGINT", "SIGTERM"];

for (const signal of signals) {
	process.on(signal, () => {
		console.log(`Received ${signal}. Shutting down...`);
		server.stop();
		process.exit(0);
	});
}

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (error) => {
	console.error("Unhandled rejection:", error);
});

console.log(`harness listening on :${config.PORT}`);
