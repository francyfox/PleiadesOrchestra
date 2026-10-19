import { type Static, t } from "elysia";
import { nullable, oneOf } from "../common/common.schema.ts";

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

const Source = oneOf(["local", "external"]);
const Parameters = t.Object({
	temperature: t.Optional(t.Number({ minimum: 0, maximum: 2 })),
	reasoningEffort: t.Optional(oneOf(["none", "low", "medium", "high"])),
	extraBody: t.Optional(t.Record(t.String(), t.Any())),
});

/** One agent's settings: the overrides, the env defaults (placeholders) and what is in effect. Never a key. */
export const AgentSettingsView = t.Object({
	id: t.String(),
	editable: t.Boolean(),
	overrides: t.Object({
		source: nullable(Source),
		baseUrl: nullable(t.String()),
		model: nullable(t.String()),
		providerKey: nullable(t.String()),
		parameters: Parameters,
	}),
	defaults: t.Object({
		baseUrl: nullable(t.String()),
		model: t.String(),
		temperature: nullable(t.Number()),
		reasoningEffort: nullable(t.String()),
	}),
	effective: t.Object({
		source: Source,
		baseUrl: nullable(t.String()),
		model: t.String(),
		provider: nullable(t.String()),
		temperature: nullable(t.Number()),
		reasoningEffort: nullable(t.String()),
		extraBody: t.Record(t.String(), t.Any()),
	}),
	updatedBy: nullable(t.String()),
	updatedAt: nullable(t.Number()),
});

/** A field left out stays, `null` clears it (= the env value); `parameters` is replaced as a whole. */
export const AgentSettingsPatch = t.Object({
	source: t.Optional(nullable(Source)),
	baseUrl: t.Optional(nullable(t.String())),
	model: t.Optional(nullable(t.String())),
	providerKey: t.Optional(nullable(t.String())),
	parameters: t.Optional(nullable(Parameters)),
});

export const AgentTestResult = t.Object({
	ok: t.Boolean(),
	answer: t.Optional(t.String()),
	error: t.Optional(t.String()),
	latencyMs: t.Number(),
});

/** A provider key as the panel sees it: a mask, never the key. */
export const ProviderKey = t.Object({
	name: t.String(),
	mask: t.String(),
	updatedBy: t.String(),
	updatedAt: t.Number(),
});

export type AgentSettingsView = Static<typeof AgentSettingsView>;
export type AgentSettingsPatch = Static<typeof AgentSettingsPatch>;
export type AgentTestResult = Static<typeof AgentTestResult>;
export type ProviderKey = Static<typeof ProviderKey>;
export type AgentRole = Static<typeof AgentRole>;
export type AgentStatus = Static<typeof AgentStatus>;
export type Agent = Static<typeof Agent>;
