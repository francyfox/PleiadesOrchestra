import { eq } from "drizzle-orm";
import { publicEndpoint } from "../agents/agents.service.ts";
import { agentSettings, providerKeys } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import {
	AGENT_IDS,
	type AgentId,
	type AgentParameters,
	EDITABLE_AGENT_IDS,
	type EffectiveSettings,
	type EnvDefaults,
} from "./agent-settings.types.ts";

type Row = typeof agentSettings.$inferSelect;

/** Bad input for a settings write (unknown key name, gamma, no secret): the route answers 400. */
export class AgentSettingsError extends Error {}

// --- encryption: AES-GCM, key = SHA-256 of PROVIDER_KEYS_SECRET --------------

async function aesKey(secret: string): Promise<CryptoKey> {
	const hash = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(secret),
	);
	return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);
}

/** `base64(iv ‖ ciphertext)`; a fresh random IV every time. */
export async function encryptSecret(
	secret: string,
	plain: string,
): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const sealed = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		await aesKey(secret),
		new TextEncoder().encode(plain),
	);
	return Buffer.concat([iv, new Uint8Array(sealed)]).toString("base64");
}

export async function decryptSecret(
	secret: string,
	sealed: string,
): Promise<string> {
	const bytes = Buffer.from(sealed, "base64");
	const plain = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: bytes.subarray(0, 12) },
		await aesKey(secret),
		bytes.subarray(12),
	);
	return new TextDecoder().decode(plain);
}

/** All the admin panel ever shows of a key. */
export function maskKey(plain: string): string {
	return `••••${plain.slice(-4)}`;
}

// --- effective settings -----------------------------------------------------

/**
 * The override where one is set, else the env value. `source: local` means
 * "the env server": the URL, model and key overrides are ignored (parameters
 * still apply). The env key is never sent to a URL the admin changed.
 */
export function buildEffective(
	defaults: EnvDefaults,
	row: Row | undefined,
	providerKey?: { name: string; plain: string },
): EffectiveSettings {
	const external = row?.source !== "local";
	const baseUrl = (external && row?.baseUrl) || defaults.baseUrl;
	const parameters = (row?.parameters ?? {}) as AgentParameters;
	const key = external ? providerKey : undefined;
	return {
		source: row?.source ?? "local",
		baseUrl,
		apiKey: key?.plain ?? (baseUrl === defaults.baseUrl ? defaults.apiKey : ""),
		model: (external && row?.model) || defaults.model,
		provider: key?.name,
		temperature: parameters.temperature ?? defaults.temperature,
		reasoningEffort: parameters.reasoningEffort ?? defaults.reasoningEffort,
		extraBody: parameters.extraBody ?? {},
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

// --- store + runtime --------------------------------------------------------

export interface AgentSettingsDeps {
	db: Db;
	/** `PROVIDER_KEYS_SECRET`; without it provider keys cannot be stored. */
	secret?: string;
	defaults: Record<AgentId, EnvDefaults>;
	now?: () => number;
	fetch?: typeof fetch;
}

export interface SettingsPatch {
	source?: "local" | "external" | null;
	baseUrl?: string | null;
	model?: string | null;
	providerKey?: string | null;
	parameters?: AgentParameters | null;
}

/**
 * Per-agent settings in the DB over the env defaults. There is one process:
 * `effective()` answers from a cache that `refresh()` rebuilds (WebCrypto
 * decrypts asynchronously), and a save calls the `onChange` listeners so the
 * agents are rebuilt without a restart.
 */
export function createAgentSettings(deps: AgentSettingsDeps) {
	const { db, secret, defaults } = deps;
	const now = deps.now ?? Date.now;
	const cache = new Map<AgentId, EffectiveSettings>();
	const listeners: Array<() => void> = [];

	const row = (id: AgentId) =>
		db.select().from(agentSettings).where(eq(agentSettings.agentId, id)).get();

	async function resolve(id: AgentId): Promise<EffectiveSettings> {
		const saved = row(id);
		let key: { name: string; plain: string } | undefined;
		if (saved?.providerKey && secret) {
			const stored = db
				.select()
				.from(providerKeys)
				.where(eq(providerKeys.name, saved.providerKey))
				.get();
			if (stored)
				key = {
					name: stored.name,
					plain: await decryptSecret(secret, stored.encryptedKey),
				};
		}
		return buildEffective(defaults[id], saved, key);
	}

	async function refresh() {
		for (const id of AGENT_IDS) cache.set(id, await resolve(id));
	}

	function assertEditable(id: AgentId) {
		if (!EDITABLE_AGENT_IDS.includes(id))
			throw new AgentSettingsError(`${id} stays on its env server`);
	}

	return {
		refresh,
		/** Settings the agent is built from; call `refresh()` once at startup. */
		effective(id: AgentId): EffectiveSettings {
			const settings = cache.get(id);
			if (!settings) throw new Error("agent settings not loaded");
			return settings;
		},
		onChange(listener: () => void) {
			listeners.push(listener);
		},
		/** Builds a thing from the settings now and again after every save; a run in progress keeps the one it got. */
		track<T>(build: () => T): () => T {
			let current = build();
			listeners.push(() => {
				current = build();
			});
			return () => current;
		},
		/** What the admin panel needs: the overrides, the env defaults (as placeholders) and what is in effect. No keys. */
		view(id: AgentId) {
			const saved = row(id);
			const effective = this.effective(id);
			const clean = (url: string | null | undefined) =>
				url ? publicEndpoint(url) : null;
			return {
				id,
				editable: EDITABLE_AGENT_IDS.includes(id),
				overrides: {
					source: saved?.source ?? null,
					baseUrl: clean(saved?.baseUrl),
					model: saved?.model ?? null,
					providerKey: saved?.providerKey ?? null,
					parameters: (saved?.parameters ?? {}) as AgentParameters,
				},
				defaults: {
					baseUrl: clean(defaults[id].baseUrl),
					model: defaults[id].model,
					temperature: defaults[id].temperature ?? null,
					reasoningEffort: defaults[id].reasoningEffort ?? null,
				},
				effective: {
					source: effective.source,
					baseUrl: clean(effective.baseUrl),
					model: effective.model,
					provider: effective.provider ?? null,
					temperature: effective.temperature ?? null,
					reasoningEffort: effective.reasoningEffort ?? null,
					extraBody: effective.extraBody,
				},
				updatedBy: saved?.updatedBy ?? null,
				updatedAt: saved?.updatedAt ?? null,
			};
		},
		/** A field left out stays, `null` clears it (= the env value). */
		async patch(id: AgentId, patch: SettingsPatch, adminId: string) {
			assertEditable(id);
			const saved = row(id);
			const keep = <T>(
				patched: T | null | undefined,
				old: T | null | undefined,
			) => (patched === undefined ? (old ?? null) : patched);
			const next = {
				source: keep(patch.source, saved?.source),
				baseUrl: keep(patch.baseUrl, saved?.baseUrl),
				model: keep(patch.model, saved?.model),
				providerKey: keep(patch.providerKey, saved?.providerKey),
				parameters: keep(patch.parameters, saved?.parameters) ?? {},
			};
			if (next.baseUrl && !/^https?:\/\//.test(next.baseUrl))
				throw new AgentSettingsError("baseUrl must be an http(s) URL");
			if (
				next.providerKey &&
				!db
					.select()
					.from(providerKeys)
					.where(eq(providerKeys.name, next.providerKey))
					.get()
			)
				throw new AgentSettingsError(`no provider key "${next.providerKey}"`);
			const values = { ...next, updatedBy: adminId, updatedAt: now() };
			db.insert(agentSettings)
				.values({ agentId: id, ...values })
				.onConflictDoUpdate({ target: agentSettings.agentId, set: values })
				.run();
			await refresh();
			for (const listener of listeners) listener();
		},
		listKeys() {
			return Promise.all(
				db
					.select()
					.from(providerKeys)
					.all()
					.map(async (stored) => ({
						name: stored.name,
						mask: maskKey(
							secret ? await decryptSecret(secret, stored.encryptedKey) : "",
						),
						updatedBy: stored.updatedBy,
						updatedAt: stored.updatedAt,
					})),
			);
		},
		async putKey(name: string, key: string, adminId: string) {
			if (!secret)
				throw new AgentSettingsError("PROVIDER_KEYS_SECRET is not set");
			const values = {
				encryptedKey: await encryptSecret(secret, key),
				updatedBy: adminId,
				updatedAt: now(),
			};
			db.insert(providerKeys)
				.values({ name, ...values })
				.onConflictDoUpdate({ target: providerKeys.name, set: values })
				.run();
			await refresh();
			for (const listener of listeners) listener();
			return {
				name,
				mask: maskKey(key),
				updatedBy: adminId,
				updatedAt: values.updatedAt,
			};
		},
		async deleteKey(name: string) {
			const gone = db
				.delete(providerKeys)
				.where(eq(providerKeys.name, name))
				.returning()
				.all();
			await refresh();
			for (const listener of listeners) listener();
			return gone.length > 0;
		},
		/** One plain chat call with the settings in effect (not schema-constrained, even for delta): the answer and the latency. */
		async test(id: AgentId) {
			assertEditable(id);
			const s = this.effective(id);
			const fetchFn = deps.fetch ?? fetch;
			const startedAt = Date.now();
			try {
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
