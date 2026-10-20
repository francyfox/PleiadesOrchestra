import type { Agent } from "@repo/core";
import { Elysia, t } from "elysia";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { Db } from "../database/database.ts";
import { ResetThreadQuery } from "./threads.schema.ts";
import { threadIdsByExternal } from "./threads.service.ts";

export interface ThreadsDeps {
	db: Db;
	directory: ChannelDirectory;
	agent: Agent;
}

export function threadsRoutes({ db, directory, agent }: ThreadsDeps) {
	return new Elysia({ tags: ["Transport"] }).post(
		"/v1/threads/:id/reset",
		async ({ params, query }) => {
			const channelId = query.channel
				? directory.bySlug(query.channel)?.id
				: undefined;
			// The external id is ambiguous across channels/visitors (threads are
			// per visitor); without `?channel=` every matching thread is reset.
			for (const threadId of threadIdsByExternal(db, params.id, channelId)) {
				await agent.resetThread(threadId);
			}
			return new Response(null, { status: 204 });
		},
		{
			query: ResetThreadQuery,
			response: { 204: t.Void() },
			detail: {
				summary: "Reset a thread",
				description:
					"Clears the history of every thread with this external id (narrowed by `?channel=`). Always 204, also when nothing matched.",
			},
		},
	);
}
