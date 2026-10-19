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

export const REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;

/** What today's env says for one agent. */
export interface EnvDefaults {
	baseUrl: string;
	apiKey: string;
	model: string;
	temperature?: number;
	reasoningEffort?: string;
}

export type AgentParameters = {
	temperature?: number;
	reasoningEffort?: (typeof REASONING_EFFORTS)[number];
	/** Extra request-body fields, e.g. `{ provider: { require_parameters: true } }` for OpenRouter. */
	extraBody?: Record<string, unknown>;
};

/** The settings an agent is built from: the override where one is set, else the env value. */
export interface EffectiveSettings {
	source: "local" | "external";
	baseUrl: string;
	/** Never leaves the process. */
	apiKey: string;
	model: string;
	/** Name of the picked provider key; the usage ledger shows it as `provider`. */
	provider?: string;
	temperature?: number;
	reasoningEffort?: string;
	extraBody: Record<string, unknown>;
}
