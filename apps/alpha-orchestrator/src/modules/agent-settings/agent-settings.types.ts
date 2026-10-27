import type {
	ModelType,
	ReasoningEffort,
} from "../providers/providers.service.ts";

export const AGENT_IDS = [
	"beta-text",
	"delta-function-call",
	"gamma-decision",
	"alpha-understand",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/** Gamma asks decision models (Laya, Jev, OpenRouter d1), the others language models: an agent picks only a model of its type. */
export const modelTypeOf = (id: AgentId): ModelType =>
	id === "gamma-decision" ? "decision" : "language";

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
