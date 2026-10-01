import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { DynamicActionInfo, GoapActionInfo } from "./goap.schema.ts";

export function goapRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.goap", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app.get(
				"/goap/actions",
				({ query }) => orchestrator.goapActions(query.userId),
				{
					query: t.Object({ userId: t.Optional(t.String()) }),
					response: {
						200: t.Object({
							actions: t.Array(GoapActionInfo),
							dynamicActions: t.Optional(t.Array(DynamicActionInfo)),
						}),
						...Upstream,
					},
					detail: {
						summary: "The GOAP action catalog",
						description:
							"With ?userId=, also lists that user's dynamic actions (e.g. a WebMCP tool catalog) reconstructed from their own run history.",
					},
				},
			),
		);
}
