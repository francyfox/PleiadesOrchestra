import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ownerScope } from "../channels/channels.service.ts";
import { ApiError } from "../common/common.schema.ts";
import { IdParams, Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import {
	CreateWebhookInput,
	UpdateWebhookInput,
	WebhookResult,
	WebhooksList,
	WebhookTestResult,
	WebhookWithSecret,
} from "./webhooks.schema.ts";

/**
 * Notification webhooks: a URL subscribed to events, signed with a secret shown once.
 * A customer works on their own only (the orchestrator answers 404 for a foreign id); staff on all.
 */
export function webhooksRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.webhooks", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ account: true }, (app) =>
			app
				.get(
					"/webhooks",
					({ account }) =>
						orchestrator.listWebhooks({ ownerId: ownerScope(account) }),
					{
						response: { 200: WebhooksList, ...Upstream },
						detail: { summary: "Webhooks and the event catalog" },
					},
				)
				.post(
					"/webhooks",
					({ body, account }) =>
						orchestrator
							.as(account.id)
							.createWebhook({ ...body, ownerId: ownerScope(account) }),
					{
						body: CreateWebhookInput,
						response: { 200: WebhookWithSecret, 400: ApiError, ...Upstream },
						detail: {
							summary: "Register a webhook",
							description:
								"https and public addresses only; a customer has at most 5 (400 otherwise). The secret is returned once.",
						},
					},
				)
				.patch(
					"/webhooks/:id",
					({ params, body, account }) =>
						orchestrator
							.as(account.id)
							.updateWebhook(params.id, body, { ownerId: ownerScope(account) }),
					{
						params: IdParams,
						body: UpdateWebhookInput,
						response: { 200: WebhookResult, 400: ApiError, ...Upstream },
						detail: { summary: "Change events or enable/disable" },
					},
				)
				.post(
					"/webhooks/:id/secret",
					({ params, account }) =>
						orchestrator
							.as(account.id)
							.rotateWebhookSecret(params.id, { ownerId: ownerScope(account) }),
					{
						params: IdParams,
						response: { 200: WebhookWithSecret, ...Upstream },
						detail: { summary: "Rotate the signing secret (returned once)" },
					},
				)
				.post(
					"/webhooks/:id/test",
					({ params, account }) =>
						orchestrator
							.as(account.id)
							.testWebhook(params.id, { ownerId: ownerScope(account) }),
					{
						params: IdParams,
						response: { 200: WebhookTestResult, ...Upstream },
						detail: { summary: "Send a webhook.test event now" },
					},
				)
				.delete(
					"/webhooks/:id",
					async ({ params, account, set }) => {
						await orchestrator
							.as(account.id)
							.deleteWebhook(params.id, { ownerId: ownerScope(account) });
						set.status = 204;
					},
					{
						params: IdParams,
						response: { 204: t.Void(), ...Upstream },
						detail: { summary: "Delete a webhook" },
					},
				),
		);
}
