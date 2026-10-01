import { createObservability, serve } from "@repo/elysia-kit";
import { createApp } from "./app.ts";
import { config } from "./modules/config/config.service.ts";
import { loadDecisionEngine } from "./modules/decision-engine/decision-engine.ts";

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
