import { t } from "elysia";

/** A model service the orchestrator talks to, with its last health probe. */
export const Agent = t.Object({
	id: t.String(),
	name: t.String(),
	role: t.Union([
		t.Literal("text"),
		t.Literal("decision"),
		t.Literal("function-call"),
		t.Literal("understand"),
	]),
	/** Base URL without credentials. */
	endpoint: t.String(),
	model: t.Nullable(t.String()),
	status: t.Union([t.Literal("up"), t.Literal("down")]),
	/** How long the health probe took (the ping), not a model call. */
	latencyMs: t.Nullable(t.Number()),
	/** Mean latency of this model's real, successful calls over the last 24 h; null when there were none. */
	responseMs: t.Nullable(t.Number()),
	checkedAt: t.Number(),
});

export const AgentList = t.Object({ items: t.Array(Agent) });
