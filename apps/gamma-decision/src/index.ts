import { loadDecisionEngine } from "./decision-engine.ts";
import { config } from "./env.ts";
import { createApp } from "./server.ts";

const engine = await loadDecisionEngine(config);

const app = createApp({
	decide: engine.decide,
	apiKey: config.LAYA_API_KEY,
}).listen(config.PORT);

const signals = ["SIGINT", "SIGTERM"];

for (const signal of signals) {
	process.on(signal, async () => {
		console.log(`Received ${signal}. Shutting down...`);
		app.stop();
		await engine.close();
		process.exit(0);
	});
}

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (error) => {
	console.error("Unhandled rejection:", error);
});

console.log(`laya-api listening on :${config.PORT}`);
