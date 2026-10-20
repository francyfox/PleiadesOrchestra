import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import {
	IntentResult,
	IntentsPage,
	IntentsQuery,
	IntentVerdictBody,
} from "./intents.schema.ts";
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

/**
 * Admin routes for the learned intent examples: the list a person judges, and
 * the verdict (approve, reject or correct). A verdict changes what the site's
 * classifier answers, so the channel's model is rebuilt. Auth is enforced by
 * the app's `onRequest` guard.
 */
export function intentsRoutes({ db, memory, now }: IntentsDeps) {
	return new Elysia({ prefix: "/v1/admin/intents", tags: ["Admin: intents"] })
		.get("/", ({ query }) => listIntentExamples(db, query), {
			query: IntentsQuery,
			response: { 200: IntentsPage },
			detail: {
				summary: "List learned intent examples",
				description:
					"Newest activity first; filter by `status` and `channelId`.",
			},
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
				body: IntentVerdictBody,
				response: { 200: IntentResult, 404: t.String() },
				detail: {
					summary: "Judge an intent example",
					description:
						"Approve, reject or correct the intent (a correction approves it). Rebuilds the channel's classifier.",
				},
			},
		);
}
