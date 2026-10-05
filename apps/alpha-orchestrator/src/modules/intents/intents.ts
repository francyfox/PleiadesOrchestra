import { TOOL_INTENTS } from "@repo/core";
import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { oneOf, PageQuery } from "../http/http.ts";
import {
	type IntentMemory,
	judgeIntentExample,
	listIntentExamples,
} from "./intents.service.ts";

export interface IntentsDeps {
	db: Db;
	memory: IntentMemory;
	now: () => number;
}

const INTENTS = ["chat", ...TOOL_INTENTS] as const;

/**
 * Admin routes for the learned intent examples: the list a person judges, and
 * the verdict (approve, reject or correct). A verdict changes what the site's
 * classifier answers, so the channel's model is rebuilt. Auth is enforced by
 * the app's `onRequest` guard.
 */
export function intentsRoutes({ db, memory, now }: IntentsDeps) {
	return new Elysia({ prefix: "/v1/admin/intents" })
		.get("/", ({ query }) => listIntentExamples(db, query), {
			query: t.Composite([
				PageQuery,
				t.Object({
					status: t.Optional(oneOf(["pending", "approved", "rejected"])),
					channelId: t.Optional(t.String({ minLength: 1 })),
				}),
			]),
		})
		.patch(
			"/:id",
			({ params, body, status }) => {
				const item = judgeIntentExample(db, params.id, body, now());
				if (!item) return status(404, "Not found");
				memory.invalidate(item.channelId);
				return { item };
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({
					status: t.Optional(oneOf(["pending", "approved", "rejected"])),
					intent: t.Optional(oneOf(INTENTS)),
				}),
			},
		);
}
