import type {
	ProviderType,
	ReasoningEffort,
} from "../providers/providers.service.ts";

export const AGENT_IDS = [
	"beta-text",
	"delta-function-call",
	"gamma-decision",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/** Gamma speaks systemone (Laya, Jev), the others OpenAI chat: an agent picks only a provider of its type. */
export const providerTypeOf = (id: AgentId): ProviderType =>
	id === "gamma-decision" ? "systemone" : "openai-compat";

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
