import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError } from "../common/common.schema.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import {
	Agent,
	AgentPick,
	AgentSettingsView,
	AgentTestResult,
	ProviderInput,
	ProviderList,
	ProviderModel,
	ProvidersCheck,
	ProvidersText,
} from "./agents.schema.ts";

const Id = t.Object({ id: t.String() });
/** The orchestrator answers 400 for bad input (unknown model or provider, gamma, a TOML that doesn't fit). */
const Bad = { 400: ApiError, ...Upstream } as const;

export function agentsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.agents", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/agents", async () => orchestrator.listAgents(), {
					response: { 200: t.Object({ items: t.Array(Agent) }), ...Upstream },
					detail: {
						summary: "Model services with their health",
						description:
							"The orchestrator's text (LLM) and decision (Laya) agents with the last health probe; each call starts the next one.",
					},
				})
				.get(
					"/agents/:id",
					({ params }) => orchestrator.getAgentSettings(params.id),
					{
						params: Id,
						response: { 200: AgentSettingsView, ...Upstream },
						detail: {
							summary: "An agent's model and its provider",
							description: "provider null = the env server. Never a key.",
						},
					},
				)
				.put(
					"/agents/:id/model",
					({ params, body, admin }) =>
						orchestrator.as(admin.id).pickAgentModel(params.id, body),
					{
						params: Id,
						body: AgentPick,
						response: { 200: AgentSettingsView, ...Bad },
						detail: {
							summary: "Pick an agent's model",
							description:
								"A model of providers.toml with its parameters. Takes effect without a restart.",
						},
					},
				)
				.post(
					"/agents/:id/test",
					({ params, admin }) => orchestrator.as(admin.id).testAgent(params.id),
					{
						params: Id,
						response: { 200: AgentTestResult, ...Bad },
						detail: { summary: "One call with the model in effect" },
					},
				)
				.get("/providers", async () => orchestrator.listProviders(), {
					response: { 200: ProviderList, ...Upstream },
					detail: {
						summary: "Providers and models of providers.toml",
						description: "Keys masked.",
					},
				})
				.put(
					"/providers/:id",
					({ params, body, admin }) =>
						orchestrator.as(admin.id).saveProvider(params.id, body),
					{
						params: Id,
						body: ProviderInput,
						response: { 200: ProviderList, ...Bad },
						detail: {
							summary: "Add or change a provider",
							description:
								'`apiKey` left out keeps the saved key, "" removes it, `$VAR` reads it from the env.',
						},
					},
				)
				.delete(
					"/providers/:id",
					({ params, admin }) =>
						orchestrator.as(admin.id).deleteProvider(params.id),
					{
						params: Id,
						response: { 200: ProviderList, ...Bad },
						detail: { summary: "Delete a provider with its models" },
					},
				)
				.put(
					"/providers/:id/models",
					({ params, body, query, admin }) =>
						orchestrator.as(admin.id).saveModel(params.id, body, query),
					{
						params: Id,
						body: ProviderModel,
						// The model this one was: renamed or moved, its agents follow.
						query: t.Object({
							fromProvider: t.Optional(t.String({ minLength: 1 })),
							fromId: t.Optional(t.String({ minLength: 1 })),
						}),
						response: { 200: ProviderList, ...Bad },
						detail: {
							summary: "Add or change a model (matched by id)",
							description:
								"`fromProvider` + `fromId`: the model this one replaces (another id or provider); it is removed and the agents that picked it pick this one.",
						},
					},
				)
				.delete(
					"/providers/:id/models",
					({ params, query, admin }) =>
						orchestrator.as(admin.id).deleteModel(params.id, query.model),
					{
						params: Id,
						query: t.Object({ model: t.String({ minLength: 1 }) }),
						response: { 200: ProviderList, ...Bad },
						detail: { summary: "Delete a model" },
					},
				)
				.get("/providers-toml", async () => orchestrator.getProvidersText(), {
					response: { 200: ProvidersText, ...Upstream },
					detail: { summary: "providers.toml as text, keys masked" },
				})
				.post(
					"/providers-toml/check",
					({ body, admin }) =>
						orchestrator.as(admin.id).checkProvidersText(body.toml),
					{
						body: ProvidersText,
						response: { 200: ProvidersCheck, ...Upstream },
						detail: {
							summary: "Check providers.toml without saving",
							description:
								"Always 200; `errors` empty = valid. `line` (1-based) for syntax errors, `path` for schema errors.",
						},
					},
				)
				.put(
					"/providers-toml",
					({ body, admin }) =>
						orchestrator.as(admin.id).saveProvidersText(body.toml),
					{
						body: ProvidersText,
						response: { 200: ProvidersText, ...Bad },
						detail: {
							summary: "Replace providers.toml",
							description:
								"Validated by the orchestrator (400 with the reason). A key left masked stays as saved; comments are not kept.",
						},
					},
				),
		);
}
