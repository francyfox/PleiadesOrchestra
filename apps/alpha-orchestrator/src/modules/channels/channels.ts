import { Elysia, t } from "elysia";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { Db } from "../database/database.ts";
import {
	ChannelResult,
	ChannelsPage,
	ChannelsQuery,
	ChannelWithSecret,
	CreateChannelBody,
	UpdateChannelBody,
} from "./channels.schema.ts";
import {
	createWebChannel,
	deleteOwnerChannels,
	listChannels,
	rotateChannelKeys,
	SlugTakenError,
	updateChannel,
} from "./channels.service.ts";

export interface ChannelsDeps {
	db: Db;
	directory: ChannelDirectory;
	now: () => number;
}

/** Admin routes for channels. Auth is enforced by the app's `onRequest` guard. */
export function channelsRoutes({ db, directory, now }: ChannelsDeps) {
	return new Elysia({ prefix: "/v1/admin/channels", tags: ["Admin: channels"] })
		.get("/", ({ query }) => listChannels(db, query), {
			query: ChannelsQuery,
			response: { 200: ChannelsPage },
			detail: {
				summary: "List channels",
				description:
					"Without `pageSize` the whole list is returned. `ownerId` keeps only that account's channels (`total` too).",
			},
		})
		.post(
			"/",
			({ body, status }) => {
				try {
					const created = createWebChannel(
						db,
						{
							slug: body.slug,
							name: body.name,
							accessMode: body.accessMode,
							allowedOrigins: body.allowedOrigins,
							catalogLanguage: body.catalogLanguage,
							ownerId: body.ownerId,
						},
						now(),
					);
					directory.invalidate();
					return created;
				} catch (error) {
					if (error instanceof SlugTakenError) {
						return status(409, "Slug already taken");
					}
					throw error;
				}
			},
			{
				body: CreateChannelBody,
				response: { 200: ChannelWithSecret, 409: t.String() },
				detail: {
					summary: "Create a web channel",
					description:
						"Returns the new keys. `secretKey` is shown only in this response. 409 if the slug is taken.",
				},
			},
		)
		.patch(
			"/:id",
			({ params, body, status }) => {
				const channel = updateChannel(db, params.id, body, now());
				if (!channel) return status(404, "Not found");
				directory.invalidate();
				return { channel };
			},
			{
				body: UpdateChannelBody,
				response: { 200: ChannelResult, 404: t.String() },
				detail: {
					summary: "Update a channel",
					description:
						"Only the given fields change. `disabled: true` disables the channel, `false` enables it.",
				},
			},
		)
		.post(
			"/:id/rotate-keys",
			({ params, status }) => {
				const rotated = rotateChannelKeys(db, params.id);
				if (!rotated) return status(404, "Not found");
				directory.invalidate();
				return rotated;
			},
			{
				response: { 200: ChannelWithSecret, 404: t.String() },
				detail: {
					summary: "Rotate channel keys",
					description:
						"Issues a new key pair; the old keys stop working immediately. `secretKey` is shown only in this response.",
				},
			},
		);
}

/** Admin route: remove everything an account owns when the account is deleted. */
export function ownerChannelsRoutes({
	db,
	directory,
}: Pick<ChannelsDeps, "db" | "directory">) {
	return new Elysia({
		prefix: "/v1/admin/owners",
		tags: ["Admin: channels"],
	}).delete(
		"/:ownerId/channels",
		({ params }) => {
			const deleted = deleteOwnerChannels(db, params.ownerId);
			directory.invalidate();
			return { deleted };
		},
		{
			response: { 200: t.Object({ deleted: t.Number() }) },
			detail: {
				summary: "Delete an owner's channels",
				description:
					"Removes every channel of the account with its visitors, messages and threads. `llm_calls` keep their rows with the channel reference cleared, so spend totals survive. Idempotent: `deleted` is 0 when there is nothing left.",
			},
		},
	);
}
