import { createDecisionAgent } from "@repo/core";
import { eq } from "drizzle-orm";
import { publicEndpoint } from "../agents/agents.service.ts";
import { agentSettings } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import type { ModelType } from "../providers/providers.service.ts";
import {
	maskKey,
	type Provider,
	type ProviderModel,
	type ProvidersConfig,
	ProvidersConfigError,
	removeModel,
	removeProvider,
	upsertModel,
	upsertProvider,
} from "../providers/providers.service.ts";
import {
	AGENT_IDS,
	type AgentId,
	type EffectiveSettings,
	type EnvServer,
	modelTypeOf,
} from "./agent-settings.types.ts";

type Row = typeof agentSettings.$inferSelect;

/** Bad input for a settings write (unknown model, wrong provider type): the route answers 400. */
export class AgentSettingsError extends Error {}

/**
 * The picked model of `providers.toml` with its parameters. With no pick (or
 * one gone from the file) the file's entry for the env server (same base URL
 * and model, as seeded on first start), else the bare env server. The env key
 * never leaves for another host: a provider brings its own key or none.
 */
export function buildEffective(
	modelType: ModelType,
	env: EnvServer,
	row: Row | undefined,
	providers: Provider[],
	resolveKey: (raw: string) => string,
): EffectiveSettings {
	const find = (providerOk: (p: Provider) => boolean, modelId: string) => {
		const provider = providers.find(
			(p) => providerOk(p) && p.models.some((m) => m.id === modelId),
		);
		return (
			provider && {
				provider,
				model: provider.models.find((m) => m.id === modelId),
			}
		);
	};
	const hit =
		find((p) => p.id === row?.provider, row?.model ?? "") ??
		find((p) => p.baseUrl === env.baseUrl, env.model);
	if (!hit?.model) return { ...env, extraBody: {} };
	const { provider, model } = hit;
	return {
		provider: provider.id,
		// A decision model is asked at the provider's decisions endpoint.
		baseUrl:
			modelType === "decision"
				? (provider.decisionsUrl ?? provider.baseUrl)
				: provider.baseUrl,
		apiKey: resolveKey(provider.apiKey),
		model: model.id,
		temperature: model.temperature,
		reasoningEffort: model.reasoningEffort,
		extraBody: model.extraBody,
	};
}

/** Request-body fields beyond model/messages, in the AI SDK's `providerOptions` form (camelCase becomes snake_case on the wire). */
export function providerOptionsOf(settings: EffectiveSettings) {
	const options = {
		...(settings.reasoningEffort
			? { reasoningEffort: settings.reasoningEffort }
			: {}),
		...settings.extraBody,
	};
	// biome-ignore lint/suspicious/noExplicitAny: JSONValue is what the SDK takes; extraBody is validated as JSON by the route
	return Object.keys(options).length ? (options as any) : undefined;
}

export interface AgentSettingsDeps {
	db: Db;
	/** What each agent calls before a model is picked (LLM_*, FUNCTION_CALL_*, LAYA_*). */
	env: Record<AgentId, EnvServer>;
	/** `configs/providers.toml`: the providers and models to pick from. */
	providers: ProvidersConfig;
	now?: () => number;
	fetch?: typeof fetch;
}

/**
 * Which model each agent uses (DB) over the providers file. There is one
 * process: `effective()` answers from a cache that `refresh()` rebuilds, and a
 * save calls the listeners so the agents are rebuilt without a restart.
 */
export function createAgentSettings(deps: AgentSettingsDeps) {
	const { db, env, providers } = deps;
	const now = deps.now ?? Date.now;
	const cache = new Map<AgentId, EffectiveSettings>();
	const listeners: Array<() => void> = [];

	const row = (id: AgentId) =>
		db.select().from(agentSettings).where(eq(agentSettings.agentId, id)).get();

	function refresh() {
		for (const id of AGENT_IDS)
			cache.set(
				id,
				buildEffective(
					modelTypeOf(id),
					env[id],
					row(id),
					providers.providers(),
					providers.resolveKey,
				),
			);
	}

	function changed() {
		refresh();
		for (const listener of listeners) listener();
	}

	async function editProviders(edit: (current: Provider[]) => Provider[]) {
		await providers.update(edit);
		changed();
	}

	refresh();

	return {
		/** Settings the agent is built from. */
		effective(id: AgentId): EffectiveSettings {
			const settings = cache.get(id);
			if (!settings) throw new Error("agent settings not loaded");
			return settings;
		},
		/** Builds a thing from the settings now and again after every save; a run in progress keeps the one it got. */
		track<T>(build: () => T): () => T {
			let current = build();
			listeners.push(() => {
				current = build();
			});
			return () => current;
		},
		/** The pick and what is in effect. No keys. */
		view(id: AgentId) {
			const saved = row(id);
			const s = this.effective(id);
			return {
				id,
				provider: s.provider ?? null,
				model: s.model,
				baseUrl: s.baseUrl ? publicEndpoint(s.baseUrl) : null,
				updatedBy: saved?.updatedBy ?? null,
				updatedAt: saved?.updatedAt ?? null,
			};
		},
		/** Picks a model of the providers file for the agent. */
		pick(
			id: AgentId,
			pick: { provider: string; model: string },
			adminId: string,
		) {
			const provider = providers
				.providers()
				.find((p) => p.id === pick.provider);
			const model = provider?.models.find((m) => m.id === pick.model);
			if (!model)
				throw new AgentSettingsError(
					`no model "${pick.model}" at provider "${pick.provider}"`,
				);
			const type = modelTypeOf(id);
			if (!model.types.includes(type))
				throw new AgentSettingsError(`${id} takes ${type} models only`);
			const values = { ...pick, updatedBy: adminId, updatedAt: now() };
			db.insert(agentSettings)
				.values({ agentId: id, ...values })
				.onConflictDoUpdate({ target: agentSettings.agentId, set: values })
				.run();
			changed();
		},
		/** The providers for the Models tab: keys masked. */
		providersView() {
			return providers.providers().map((p) => ({
				...p,
				apiKey: maskKey(p.apiKey),
			}));
		},
		providersText: () => providers.text(),
		checkProvidersText: (toml: string) => providers.check(toml),
		/** Replaces the file from edited text (validated; masked keys stay as saved). */
		async saveProvidersText(toml: string) {
			await providers.save(toml);
			changed();
		},
		upsertProvider: (input: Parameters<typeof upsertProvider>[1]) =>
			editProviders((current) => upsertProvider(current, input)),
		deleteProvider: (id: string) =>
			editProviders((current) => {
				if (!current.some((p) => p.id === id))
					throw new ProvidersConfigError(`no provider "${id}"`);
				return removeProvider(current, id);
			}),
		upsertModel: (providerId: string, model: ProviderModel) =>
			editProviders((current) => upsertModel(current, providerId, model)),
		deleteModel: (providerId: string, modelId: string) =>
			editProviders((current) => removeModel(current, providerId, modelId)),
		/** One plain chat call with the settings in effect (not schema-constrained, even for delta), or one tiny decision for gamma: the answer and the latency. */
		async test(id: AgentId) {
			const s = this.effective(id);
			const fetchFn = deps.fetch ?? fetch;
			const startedAt = Date.now();
			try {
				if (id === "gamma-decision") {
					const { ok } = await createDecisionAgent({
						baseURL: s.baseUrl,
						apiKey: s.apiKey,
						modelId: s.model,
						fetchImpl: ((url, init) =>
							fetchFn(url, {
								...init,
								signal: AbortSignal.timeout(30_000),
							})) as typeof fetch,
					}).decide(
						{ fact: "Water is wet." },
						{ ok: { type: "boolean", instructions: "Is the fact true?" } },
					);
					return {
						ok: true,
						answer: String((ok as { probability: number }).probability),
						latencyMs: Date.now() - startedAt,
					};
				}
				const response = await fetchFn(
					`${s.baseUrl.replace(/\/+$/, "")}/chat/completions`,
					{
						method: "POST",
						headers: {
							"content-type": "application/json",
							...(s.apiKey ? { authorization: `Bearer ${s.apiKey}` } : {}),
						},
						body: JSON.stringify({
							model: s.model,
							messages: [{ role: "user", content: "Reply with one word: OK" }],
							max_tokens: 16,
							...(s.temperature === undefined
								? {}
								: { temperature: s.temperature }),
							...(s.reasoningEffort
								? { reasoning_effort: s.reasoningEffort }
								: {}),
							...s.extraBody,
						}),
						signal: AbortSignal.timeout(30_000),
					},
				);
				const latencyMs = Date.now() - startedAt;
				if (!response.ok)
					return { ok: false, error: `HTTP ${response.status}`, latencyMs };
				const body = (await response.json()) as {
					choices?: { message?: { content?: string } }[];
				};
				return {
					ok: true,
					answer: body.choices?.[0]?.message?.content ?? "",
					latencyMs,
				};
			} catch (error) {
				return {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
					latencyMs: Date.now() - startedAt,
				};
			}
		},
	};
}

export type AgentSettings = ReturnType<typeof createAgentSettings>;
