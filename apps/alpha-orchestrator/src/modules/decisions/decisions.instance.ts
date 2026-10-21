import {
	createConcurrencyLimiter,
	createDecisionAgent,
	LAYA_CALIBRATION,
	withCalibration,
	withDecisionConcurrencyLimit,
} from "@repo/core";
import { agentSettings } from "../agent-settings/agent-settings.instance.ts";
import { config } from "../config/config.service.ts";
import { usesLayaCalibration } from "./decisions.service.ts";

// Built from the effective settings and rebuilt when an admin saves them
// (agentSettings.track); the limiter outlives a rebuild.
const current = agentSettings.track(() => {
	const s = agentSettings.effective("gamma-decision");
	const agent = createDecisionAgent({
		baseURL: s.baseUrl,
		apiKey: s.apiKey,
		modelId: s.model,
		provider: s.provider,
	});
	return usesLayaCalibration(s.model)
		? withCalibration(agent, LAYA_CALIBRATION)
		: agent;
});

// Bounds how many decide() calls run concurrently instead of letting every
// request (and, per thread, every classified WebMCP tool) hit the decision
// server at once; LAYA_MAX_CONCURRENCY should match its threads (LAYA_THREADS locally).
export const decisionAgent = withDecisionConcurrencyLimit(
	{ decide: (state, questions) => current().decide(state, questions) },
	createConcurrencyLimiter(config.LAYA_MAX_CONCURRENCY),
);
