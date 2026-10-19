import { Elysia, t } from "elysia";
import { adminIdOf } from "../http/http.service.ts";
import { oneOf } from "../http/http.ts";
import {
	type AgentSettings,
	AgentSettingsError,
} from "./agent-settings.service.ts";
import {
	AGENT_IDS,
	type AgentId,
	REASONING_EFFORTS,
} from "./agent-settings.types.ts";

export interface AgentSettingsDeps {
	settings: AgentSettings;
}

const Parameters = t.Object({
	temperature: t.Optional(t.Number({ minimum: 0, maximum: 2 })),
	reasoningEffort: t.Optional(oneOf(REASONING_EFFORTS)),
	extraBody: t.Optional(t.Record(t.String(), t.Any())),
});

const Name = t.String({ pattern: "^[a-z0-9][a-z0-9-]*$", maxLength: 64 });

/** Admin routes for per-agent model settings and provider keys. Auth is enforced by the app's `onRequest` guard. */
export function agentSettingsRoutes({ settings }: AgentSettingsDeps) {
	const known = (id: string): id is AgentId =>
		(AGENT_IDS as readonly string[]).includes(id);
	/** Domain errors are the admin's bad input: 400 with the message. */
	const guard = async <T>(
		status: (code: 400, message: string) => unknown,
		run: () => Promise<T>,
	) => {
		try {
			return await run();
		} catch (error) {
			if (error instanceof AgentSettingsError)
				return status(400, error.message);
			throw error;
		}
	};
	return new Elysia({ prefix: "/v1/admin" })
		.get("/agents/:id", ({ params, status }) =>
			known(params.id) ? settings.view(params.id) : status(404, "Not found"),
		)
		.patch(
			"/agents/:id",
			({ params, body, request, status }) => {
				const id = params.id;
				if (!known(id)) return status(404, "Not found");
				return guard(status, async () => {
					await settings.patch(id, body, adminIdOf(request));
					return settings.view(id);
				});
			},
			{
				body: t.Object({
					source: t.Optional(t.Nullable(oneOf(["local", "external"]))),
					baseUrl: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
					model: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
					providerKey: t.Optional(t.Nullable(Name)),
					parameters: t.Optional(t.Nullable(Parameters)),
				}),
			},
		)
		.post("/agents/:id/test", ({ params, status }) => {
			const id = params.id;
			if (!known(id)) return status(404, "Not found");
			return guard(status, () => settings.test(id));
		})
		.get("/provider-keys", async () => ({ items: await settings.listKeys() }))
		.put(
			"/provider-keys/:name",
			({ params, body, request, status }) =>
				guard(status, () =>
					settings.putKey(params.name, body.key, adminIdOf(request)),
				),
			{
				params: t.Object({ name: Name }),
				body: t.Object({ key: t.String({ minLength: 1, maxLength: 500 }) }),
			},
		)
		.delete("/provider-keys/:name", async ({ params, status }) =>
			(await settings.deleteKey(params.name))
				? { ok: true }
				: status(404, "Not found"),
		);
}
