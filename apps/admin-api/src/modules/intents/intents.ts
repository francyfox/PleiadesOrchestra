import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { IdParams, Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import {
	IntentExample,
	IntentsPage,
	IntentsQuery,
	IntentVerdictInput,
} from "./intents.schema.ts";

export function intentsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.intents", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/intents", ({ query }) => orchestrator.listIntents(query), {
					query: IntentsQuery,
					response: { 200: IntentsPage, ...Upstream },
					detail: {
						summary: "Messages the classifier has learned about, newest first",
						description:
							"Laya's answers wait as `pending`; only `approved` ones (approved or corrected by an admin) feed a site's classifier.",
					},
				})
				.patch(
					"/intents/:id",
					({ params, body, admin }) =>
						orchestrator.as(admin.id).judgeIntent(params.id, body),
					{
						params: IdParams,
						body: IntentVerdictInput,
						response: { 200: t.Object({ item: IntentExample }), ...Upstream },
						detail: {
							summary: "Approve, reject or correct a learned example",
							description:
								"A new `intent` is the admin's own label and approves the example with it.",
						},
					},
				),
		);
}
