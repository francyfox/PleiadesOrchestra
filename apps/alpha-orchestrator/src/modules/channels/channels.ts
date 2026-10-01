import { Elysia, t } from "elysia";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { Db } from "../database/database.ts";
import { oneOf, PageQuery } from "../http/http.ts";
import {
	createWebChannel,
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

const AccessModeSchema = oneOf(["whitelist", "open"]);
const SlugSchema = t.String({ pattern: "^[a-z0-9][a-z0-9-]*$", maxLength: 64 });

/** Admin routes for channels. Auth is enforced by the app's `onRequest` guard. */
export function channelsRoutes({ db, directory, now }: ChannelsDeps) {
	return new Elysia({ prefix: "/v1/admin/channels" })
		.get("/", ({ query }) => listChannels(db, query), { query: PageQuery })
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
				body: t.Object({
					slug: SlugSchema,
					name: t.String({ minLength: 1 }),
					kind: t.Literal("web"),
					accessMode: AccessModeSchema,
					allowedOrigins: t.Array(t.String()),
				}),
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
				body: t.Object({
					name: t.Optional(t.String({ minLength: 1 })),
					accessMode: t.Optional(AccessModeSchema),
					allowedOrigins: t.Optional(t.Array(t.String())),
					disabled: t.Optional(t.Boolean()),
				}),
			},
		)
		.post("/:id/rotate-keys", ({ params, status }) => {
			const rotated = rotateChannelKeys(db, params.id);
			if (!rotated) return status(404, "Not found");
			directory.invalidate();
			return rotated;
		});
}
