import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError, PageQuery } from "../common/common.schema.ts";
import { IdParams, Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import {
	Channel,
	ChannelWithSecret,
	CreateChannelInput,
	UpdateChannelInput,
} from "./channels.schema.ts";
import { isValidSlug } from "./channels.service.ts";

export function channelsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.channels", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/channels", ({ query }) => orchestrator.listChannels(query), {
					query: PageQuery,
					response: {
						200: t.Object({ items: t.Array(Channel), total: t.Number() }),
						...Upstream,
					},
					detail: {
						summary: "List channels",
						description:
							"Without `pageSize` every channel is returned; `total` is always the full count.",
					},
				})
				.post(
					"/channels",
					async ({ body, admin, status }) => {
						const slug = body.slug.trim();
						const name = body.name.trim();
						if (!isValidSlug(slug) || !name) {
							return status(400, { error: "invalid_channel" });
						}
						return orchestrator.as(admin.id).createChannel({
							slug,
							name,
							kind: "web",
							accessMode: body.accessMode ?? "open",
							allowedOrigins: body.allowedOrigins ?? [],
						});
					},
					{
						body: CreateChannelInput,
						response: { 200: ChannelWithSecret, 400: ApiError, ...Upstream },
						detail: {
							summary: "Create a web-widget channel",
							description: "The secret key is returned once and never again.",
						},
					},
				)
				.patch(
					"/channels/:id",
					({ params, body, admin }) =>
						orchestrator.as(admin.id).updateChannel(params.id, {
							...body,
							name: body.name?.trim() || undefined,
						}),
					{
						params: IdParams,
						body: UpdateChannelInput,
						response: { 200: t.Object({ channel: Channel }), ...Upstream },
						detail: { summary: "Update / enable / disable a channel" },
					},
				)
				.post(
					"/channels/:id/rotate-keys",
					({ params, admin }) =>
						orchestrator.as(admin.id).rotateChannelKeys(params.id),
					{
						params: IdParams,
						response: { 200: ChannelWithSecret, ...Upstream },
						detail: { summary: "Rotate a channel's keys" },
					},
				),
		);
}
