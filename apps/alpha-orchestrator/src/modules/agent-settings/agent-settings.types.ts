import type { ReasoningEffort } from "../providers/providers.service.ts";

export const AGENT_IDS = [
	"beta-text",
	"delta-function-call",
	"gamma-decision",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/** Gamma (Laya) speaks its own protocol: it is shown here, but stays on its env server. */
export const EDITABLE_AGENT_IDS: readonly AgentId[] = [
	"beta-text",
	"delta-function-call",
];

/** The server env names for one agent; used until a model is picked. */
export interface EnvServer {
	baseUrl: string;
	apiKey: string;
	model: string;
}

/** The settings an agent is built from. */
export interface EffectiveSettings {
	baseUrl: string;
	/** Never leaves the process. */
	apiKey: string;
	model: string;
	/** Id of the picked provider (unset = the env server); the usage ledger shows it as `provider`. */
	provider?: string;
	temperature?: number;
	reasoningEffort?: ReasoningEffort;
	extraBody: Record<string, unknown>;
}
