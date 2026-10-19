import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError } from "../common/common.schema.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import {
	Agent,
	AgentSettingsPatch,
	AgentSettingsView,
	AgentTestResult,
	ProviderKey,
} from "./agents.schema.ts";

const Id = t.Object({ id: t.String() });
const Name = t.Object({ name: t.String() });
/** The orchestrator answers 400 for bad settings (unknown key, gamma, no encryption secret). */
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
							"The orchestrator's text (LLM) and decision (Laya) agents, each probed at request time.",
					},
				})
				.get(
					"/agents/:id",
					({ params }) => orchestrator.getAgentSettings(params.id),
					{
						params: Id,
						response: { 200: AgentSettingsView, ...Upstream },
						detail: {
							summary:
								"An agent's settings: overrides, env defaults, effective",
						},
					},
				)
				.patch(
					"/agents/:id",
					({ params, body, admin }) =>
						orchestrator.as(admin.id).patchAgentSettings(params.id, body),
					{
						params: Id,
						body: AgentSettingsPatch,
						response: { 200: AgentSettingsView, ...Bad },
						detail: {
							summary: "Change an agent's settings",
							description:
								"A field set to null clears its override (the env value applies). Takes effect without a restart.",
						},
					},
				)
				.post(
					"/agents/:id/test",
					({ params, admin }) => orchestrator.as(admin.id).testAgent(params.id),
					{
						params: Id,
						response: { 200: AgentTestResult, ...Bad },
						detail: { summary: "One call with the settings in effect" },
					},
				)
				.get("/provider-keys", async () => orchestrator.listProviderKeys(), {
					response: {
						200: t.Object({ items: t.Array(ProviderKey) }),
						...Upstream,
					},
					detail: { summary: "Provider API keys, masked" },
				})
				.put(
					"/provider-keys/:name",
					({ params, body, admin }) =>
						orchestrator.as(admin.id).saveProviderKey(params.name, body.key),
					{
						params: Name,
						body: t.Object({ key: t.String({ minLength: 1, maxLength: 500 }) }),
						response: { 200: ProviderKey, ...Bad },
						detail: { summary: "Add or replace a provider's API key" },
					},
				)
				.delete(
					"/provider-keys/:name",
					({ params, admin }) =>
						orchestrator.as(admin.id).deleteProviderKey(params.name),
					{
						params: Name,
						response: { 200: t.Object({ ok: t.Literal(true) }), ...Upstream },
						detail: { summary: "Delete a provider's API key" },
					},
				),
		);
}
