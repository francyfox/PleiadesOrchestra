import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { OwnerQuery } from "../visitors/visitors.schema.ts";
import {
	CreateWebhookBody,
	UpdateWebhookBody,
	WebhookResult,
	WebhooksList,
	WebhookTestResult,
	WebhookWithSecret,
} from "./webhooks.schema.ts";
import {
	assertPublicUrl,
	type createNotifier,
	createWebhook,
	deleteWebhook,
	type GuardDeps,
	getWebhook,
	listWebhooks,
	publicWebhook,
	rotateWebhookSecret,
	UnsafeWebhookUrlError,
	updateWebhook,
	WebhookRuleError,
} from "./webhooks.service.ts";
import { WEBHOOK_EVENT_SCOPE, WEBHOOK_EVENTS } from "./webhooks.types.ts";

export interface WebhooksDeps extends GuardDeps {
	db: Db;
	now: () => number;
	notifier: ReturnType<typeof createNotifier>;
}

/**
 * Admin routes for notification webhooks. Auth is enforced by the app's guard.
 * `ownerId` (query, or body on create) is a customer's view: only their webhooks,
 * a foreign id is 404; without it (staff) every webhook is reachable.
 */
export function webhooksRoutes({ db, now, notifier, ...guard }: WebhooksDeps) {
	const rule = (error: unknown): string | undefined => {
		if (error instanceof WebhookRuleError) return error.message;
		if (error instanceof UnsafeWebhookUrlError) return error.message;
		throw error;
	};
	return new Elysia({
		prefix: "/v1/admin/webhooks",
		tags: ["Admin: webhooks"],
	})
		.get(
			"/",
			({ query }) => ({
				items: listWebhooks(db, query.ownerId).map(publicWebhook),
				events: WEBHOOK_EVENTS.map((name) => ({
					name,
					scope: WEBHOOK_EVENT_SCOPE[name],
				})),
			}),
			{
				query: OwnerQuery,
				response: { 200: WebhooksList },
				detail: { summary: "List webhooks and the event catalog" },
			},
		)
		.post(
			"/",
			async ({ body, status }) => {
				try {
					// A customer's webhook never gets the dev allowance for private targets.
					await assertPublicUrl(body.url, {
						...guard,
						allowPrivate: guard.allowPrivate && body.ownerId === undefined,
					});
					const row = createWebhook(db, body, now());
					return { item: publicWebhook(row), secret: row.secret };
				} catch (error) {
					return status(400, rule(error) ?? "Bad request");
				}
			},
			{
				body: CreateWebhookBody,
				response: { 200: WebhookWithSecret, 400: t.String() },
				detail: {
					summary: "Register a webhook",
					description:
						"https only, public addresses only; a customer (`ownerId`) has at most 5 and customer events only. The signing `secret` is returned once.",
				},
			},
		)
		.patch(
			"/:id",
			async ({ params, query, body, status }) => {
				try {
					// Same URL rules as create; a customer's webhook never gets the dev allowance.
					if (body.url !== undefined) {
						await assertPublicUrl(body.url, {
							...guard,
							allowPrivate: guard.allowPrivate && query.ownerId === undefined,
						});
					}
					const row = updateWebhook(db, params.id, body, query.ownerId);
					return row ? { item: publicWebhook(row) } : status(404, "Not found");
				} catch (error) {
					return status(400, rule(error) ?? "Bad request");
				}
			},
			{
				query: OwnerQuery,
				body: UpdateWebhookBody,
				response: { 200: WebhookResult, 400: t.String(), 404: t.String() },
				detail: { summary: "Change events or enable/disable" },
			},
		)
		.post(
			"/:id/secret",
			({ params, query, status }) => {
				const row = rotateWebhookSecret(db, params.id, query.ownerId);
				return row
					? { item: publicWebhook(row), secret: row.secret }
					: status(404, "Not found");
			},
			{
				query: OwnerQuery,
				response: { 200: WebhookWithSecret, 404: t.String() },
				detail: { summary: "Rotate the signing secret (returned once)" },
			},
		)
		.post(
			"/:id/test",
			async ({ params, query, status }) => {
				const row = getWebhook(db, params.id, query.ownerId);
				if (!row) return status(404, "Not found");
				return notifier.send(row, "webhook.test", { message: "Test delivery" });
			},
			{
				query: OwnerQuery,
				response: { 200: WebhookTestResult, 404: t.String() },
				detail: { summary: "Send a webhook.test event now" },
			},
		)
		.delete(
			"/:id",
			({ params, query, status }) => {
				if (!deleteWebhook(db, params.id, query.ownerId)) {
					return status(404, "Not found");
				}
				return new Response(null, { status: 204 });
			},
			{
				query: OwnerQuery,
				response: { 204: t.Void(), 404: t.String() },
				detail: { summary: "Delete a webhook" },
			},
		);
}
