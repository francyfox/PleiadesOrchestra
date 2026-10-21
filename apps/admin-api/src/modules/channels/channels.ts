import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError } from "../common/common.schema.ts";
import {
	IdParams,
	OwnedUpstream,
	Upstream,
} from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import {
	Channel,
	ChannelsQuery,
	ChannelWithSecret,
	CreateChannelInput,
	Persona,
	PersonaView,
	UpdateChannelInput,
} from "./channels.schema.ts";
import {
	isValidLanguage,
	isValidSlug,
	mayAccessChannel,
	ownerScope,
} from "./channels.service.ts";

/**
 * Channels. Staff see and edit all; a user (level 200) only their own: the
 * owner is forced from the session on lists and creates, and any route on a
 * channel that is not theirs answers 404 `not_found` (never 403: no probing for ids).
 */
export function channelsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.channels", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ account: true }, (app) =>
			app
				.get(
					"/channels",
					({ query, account }) =>
						orchestrator.listChannels({
							...query,
							ownerId: ownerScope(account) ?? query.ownerId,
						}),
					{
						query: ChannelsQuery,
						response: {
							200: t.Object({ items: t.Array(Channel), total: t.Number() }),
							...Upstream,
						},
						detail: {
							summary: "List channels",
							description:
								"Without `pageSize` every channel is returned; `total` is always the full count. A user gets only their own channels; staff may filter with `ownerId`.",
						},
					},
				)
				.post(
					"/channels",
					async ({ body, account, status }) => {
						const slug = body.slug.trim();
						const name = body.name.trim();
						if (!isValidSlug(slug) || !name) {
							return status(400, { error: "invalid_channel" });
						}
						if (
							body.catalogLanguage !== undefined &&
							!isValidLanguage(body.catalogLanguage)
						) {
							return status(400, { error: "invalid_language" });
						}
						const ownerId = ownerScope(account) ?? body.ownerId;
						return orchestrator.as(account.id).createChannel({
							slug,
							name,
							kind: "web",
							accessMode: body.accessMode ?? "open",
							allowedOrigins: body.allowedOrigins ?? [],
							// Left out when not given: the orchestrator's default (English) applies.
							...(body.catalogLanguage
								? { catalogLanguage: body.catalogLanguage }
								: {}),
							...(ownerId ? { ownerId } : {}),
						});
					},
					{
						body: CreateChannelInput,
						response: { 200: ChannelWithSecret, 400: ApiError, ...Upstream },
						detail: {
							summary: "Create a web-widget channel",
							description:
								"The secret key is returned once and never again. A user's channel is owned by them; staff may set `ownerId` (left out = staff-owned).",
						},
					},
				)
				.patch(
					"/channels/:id",
					async ({ params, body, account, status }) => {
						if (!(await mayAccessChannel(orchestrator, account, params.id))) {
							return status(404, { error: "not_found" });
						}
						if (
							body.catalogLanguage !== undefined &&
							!isValidLanguage(body.catalogLanguage)
						) {
							return status(400, { error: "invalid_language" });
						}
						return orchestrator.as(account.id).updateChannel(params.id, {
							...body,
							name: body.name?.trim() || undefined,
						});
					},
					{
						params: IdParams,
						body: UpdateChannelInput,
						response: {
							200: t.Object({ channel: Channel }),
							400: ApiError,
							...OwnedUpstream,
						},
						detail: { summary: "Update / enable / disable a channel" },
					},
				)
				.get(
					"/channels/:id/persona",
					async ({ params, account, status }) => {
						if (!(await mayAccessChannel(orchestrator, account, params.id))) {
							return status(404, { error: "not_found" });
						}
						return orchestrator.getPersona(params.id);
					},
					{
						params: IdParams,
						response: { 200: PersonaView, ...OwnedUpstream },
						detail: { summary: "A channel's persona (name, tone, limits)" },
					},
				)
				.put(
					"/channels/:id/persona",
					async ({ params, body, account, status }) => {
						if (!(await mayAccessChannel(orchestrator, account, params.id))) {
							return status(404, { error: "not_found" });
						}
						if (body.defaultLang && !isValidLanguage(body.defaultLang)) {
							return status(400, { error: "invalid_language" });
						}
						return orchestrator.as(account.id).savePersona(params.id, body);
					},
					{
						params: IdParams,
						body: Persona,
						response: {
							200: PersonaView,
							400: ApiError,
							...OwnedUpstream,
						},
						detail: { summary: "Replace a channel's persona" },
					},
				)
				.post(
					"/channels/:id/persona/preview",
					async ({ params, body, account, status }) => {
						if (!(await mayAccessChannel(orchestrator, account, params.id))) {
							return status(404, { error: "not_found" });
						}
						if (body.defaultLang && !isValidLanguage(body.defaultLang)) {
							return status(400, { error: "invalid_language" });
						}
						return orchestrator.as(account.id).previewPersona(params.id, body);
					},
					{
						params: IdParams,
						body: Persona,
						response: {
							200: PersonaView,
							400: ApiError,
							...OwnedUpstream,
						},
						detail: {
							summary: "The prompt unsaved persona values would produce",
						},
					},
				)
				.post(
					"/channels/:id/rotate-keys",
					async ({ params, account, status }) => {
						if (!(await mayAccessChannel(orchestrator, account, params.id))) {
							return status(404, { error: "not_found" });
						}
						return orchestrator.as(account.id).rotateChannelKeys(params.id);
					},
					{
						params: IdParams,
						response: { 200: ChannelWithSecret, ...OwnedUpstream },
						detail: { summary: "Rotate a channel's keys" },
					},
				),
		);
}
