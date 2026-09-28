import { createObservability, serve } from "@repo/elysia-kit";
import { loadDecisionEngine } from "./decision-engine.ts";
import { config } from "./env.ts";
import { createApp } from "./server.ts";

const observability = createObservability("gamma-decision", config);
const engine = await loadDecisionEngine(config);

serve(
	createApp({
		decide: engine.decide,
		apiKey: config.LAYA_API_KEY,
		observability,
	}),
	{ port: config.PORT, observability, onShutdown: () => engine.close() },
);
