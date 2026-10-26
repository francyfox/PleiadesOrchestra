import { Elysia, t } from "elysia";
import { adminIdOf } from "../http/http.service.ts";
import { ProvidersConfigError } from "../providers/providers.service.ts";
import {
	AgentPick,
	AgentSettingsView,
	AgentTestResult,
	ProviderId,
	ProviderInput,
	ProviderList,
	ProviderModel,
	ProvidersCheck,
	ProvidersText,
} from "./agent-settings.schema.ts";
import {
	type AgentSettings,
	AgentSettingsError,
} from "./agent-settings.service.ts";
import { AGENT_IDS, type AgentId } from "./agent-settings.types.ts";

export interface AgentSettingsDeps {
	settings: AgentSettings;
}

/** Admin routes: which model an agent uses, and the providers/models of providers.toml. Auth is enforced by the app's `onRequest` guard. */
export function agentSettingsRoutes({ settings }: AgentSettingsDeps) {
	const known = (id: string): id is AgentId =>
		(AGENT_IDS as readonly string[]).includes(id);
	/** Domain errors are the admin's bad input: 400 with the message. */
	const guard = async <T, E>(
		status: (code: 400, message: string) => E,
		run: () => T | Promise<T>,
	): Promise<T | E> => {
		try {
			return await run();
		} catch (error) {
			if (
				error instanceof AgentSettingsError ||
				error instanceof ProvidersConfigError
			)
				return status(400, error.message);
			throw error;
		}
	};
	const providerList = () => ({ items: settings.providersView() });
	const ProviderParams = t.Object({ id: ProviderId });

	return new Elysia({ prefix: "/v1/admin", tags: ["Admin: agents"] })
		.get(
			"/agents/:id",
			({ params, status }) =>
				known(params.id) ? settings.view(params.id) : status(404, "Not found"),
			{
				detail: {
					summary: "Get an agent's model",
					description:
						"The model in effect and its provider (null = the env server). Never a key. 404 for an unknown agent id.",
				},
				response: { 200: AgentSettingsView, 404: t.String() },
			},
		)
		.put(
			"/agents/:id/model",
			({ params, body, request, status }) => {
				const id = params.id;
				if (!known(id)) return status(404, "Not found");
				return guard(status, () => {
					settings.pick(id, body, adminIdOf(request));
					return settings.view(id);
				});
			},
			{
				body: AgentPick,
				detail: {
					summary: "Pick an agent's model",
					description:
						"A model of providers.toml; its parameters come with it. Takes effect without a restart; a run already going keeps its model. 400 for a model not in the file or of a provider type the agent cannot use (gamma-decision takes `systemone` only).",
				},
				response: { 200: AgentSettingsView, 400: t.String(), 404: t.String() },
			},
		)
		.post(
			"/agents/:id/test",
			({ params, status }) => {
				const id = params.id;
				if (!known(id)) return status(404, "Not found");
				return guard(status, () => settings.test(id));
			},
			{
				detail: {
					summary: "Test an agent",
					description:
						"One plain chat call with the model in effect (gamma-decision: one tiny decision). A failed call is still 200 with `ok: false` and `error`.",
				},
				response: { 200: AgentTestResult, 400: t.String(), 404: t.String() },
			},
		)
		.get("/providers", providerList, {
			detail: {
				summary: "List providers and models",
				description: "From providers.toml; keys masked.",
			},
			response: { 200: ProviderList },
		})
		.put(
			"/providers/:id",
			({ params, body, status }) =>
				guard(status, async () => {
					await settings.upsertProvider({ id: params.id, ...body });
					return providerList();
				}),
			{
				params: ProviderParams,
				body: ProviderInput,
				detail: {
					summary: "Add or change a provider",
					description:
						'`apiKey` left out keeps the saved key, "" removes it, `$VAR` reads it from the env. Its models stay.',
				},
				response: { 200: ProviderList, 400: t.String() },
			},
		)
		.delete(
			"/providers/:id",
			({ params, status }) =>
				guard(status, async () => {
					await settings.deleteProvider(params.id);
					return providerList();
				}),
			{
				params: ProviderParams,
				detail: {
					summary: "Delete a provider with its models",
					description: "Agents on it fall back to their env server.",
				},
				response: { 200: ProviderList, 400: t.String() },
			},
		)
		.put(
			"/providers/:id/models",
			({ params, body, query, status }) =>
				guard(status, async () => {
					await settings.upsertModel(
						params.id,
						body,
						query.fromProvider && query.fromId
							? { provider: query.fromProvider, id: query.fromId }
							: undefined,
					);
					return providerList();
				}),
			{
				params: ProviderParams,
				body: ProviderModel,
				// The model this one was (renamed or moved); ids may hold "/" or ":", so the query.
				query: t.Object({
					fromProvider: t.Optional(t.String({ minLength: 1 })),
					fromId: t.Optional(t.String({ minLength: 1 })),
				}),
				detail: {
					summary: "Add or change a model",
					description:
						"Matched by `id` within the provider. Agents using it get the new parameters at once. `fromProvider` + `fromId` name the model this one was: when that is another id or provider it is removed, and the agents that picked it pick this one.",
				},
				response: { 200: ProviderList, 400: t.String() },
			},
		)
		.delete(
			"/providers/:id/models",
			({ params, query, status }) =>
				guard(status, async () => {
					await settings.deleteModel(params.id, query.model);
					return providerList();
				}),
			{
				params: ProviderParams,
				// A model id may hold "/" or ":", so it goes in the query.
				query: t.Object({ model: t.String({ minLength: 1 }) }),
				detail: {
					summary: "Delete a model",
					description: "Agents using it fall back to their env server.",
				},
				response: { 200: ProviderList, 400: t.String() },
			},
		)
		.get("/providers-toml", () => ({ toml: settings.providersText() }), {
			detail: {
				summary: "Get providers.toml",
				description: "The file as text, keys masked (`••••1234`).",
			},
			response: { 200: ProvidersText },
		})
		.put(
			"/providers-toml",
			({ body, status }) =>
				guard(status, async () => {
					await settings.saveProvidersText(body.toml);
					return { toml: settings.providersText() };
				}),
			{
				body: ProvidersText,
				detail: {
					summary: "Replace providers.toml",
					description:
						"Validated first (400 with the reason). A key left masked stays as saved; comments are not kept.",
				},
				response: { 200: ProvidersText, 400: t.String() },
			},
		)
		.post(
			"/providers-toml/check",
			({ body }) => ({ errors: settings.checkProvidersText(body.toml) }),
			{
				body: ProvidersText,
				detail: {
					summary: "Check providers.toml",
					description:
						"The checks of the save (syntax, schema, masked keys) without writing. Always 200; `errors` empty = valid. `line` for syntax errors, `path` for schema errors.",
				},
				response: { 200: ProvidersCheck },
			},
		);
}
