import { createDecisionAgent } from "@repo/core";
import { config } from "./env.ts";

export const decisionAgent = createDecisionAgent({
	baseURL: config.LAYA_API_BASE_URL,
	apiKey: config.LAYA_API_KEY,
});
