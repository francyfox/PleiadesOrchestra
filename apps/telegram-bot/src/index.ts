import type { AnyBot } from "gramio";
import { webhookHandler } from "gramio";
import { bot } from "./bot.ts";
import { config } from "./env.ts";

const server = Bun.serve({
	port: config.PORT,
	routes: {
		"/health": () => new Response("ok"),
		"/webhook": {
			POST: webhookHandler(
				bot as AnyBot,
				"Bun.serve",
				config.TELEGRAM_WEBHOOK_SECRET,
			),
		},
	},
});

const signals = ["SIGINT", "SIGTERM"];

for (const signal of signals) {
	process.on(signal, async () => {
		console.log(`Received ${signal}. Initiating graceful shutdown...`);
		await bot.stop();
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

await bot.start({
	webhook: {
		url: config.TELEGRAM_WEBHOOK_URL,
		secret_token: config.TELEGRAM_WEBHOOK_SECRET,
	},
});
