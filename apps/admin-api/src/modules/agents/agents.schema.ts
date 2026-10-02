import { type Static, t } from "elysia";
import { nullable } from "../common/common.schema.ts";

export const AgentRole = t.UnionEnum(["text", "decision", "function-call"]);

export const AgentStatus = t.UnionEnum(["up", "down"]);

/** A model service the orchestrator talks to, with its last health probe. */
export const Agent = t.Object({
	id: t.String(),
	name: t.String(),
	role: AgentRole,
	/** Base URL without credentials. */
	endpoint: t.String(),
	model: nullable(t.String()),
	status: AgentStatus,
	latencyMs: nullable(t.Number()),
	checkedAt: t.Number(),
});

export type AgentRole = Static<typeof AgentRole>;
export type AgentStatus = Static<typeof AgentStatus>;
export type Agent = Static<typeof Agent>;
