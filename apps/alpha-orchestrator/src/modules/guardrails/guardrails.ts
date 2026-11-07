import { Elysia } from "elysia";
import type { Db } from "../database/database.ts";
import { adminIdOf } from "../http/http.service.ts";
import {
	GuardrailsBody,
	GuardrailsErrors,
	GuardrailsView,
} from "./guardrails.schema.ts";
import {
	DEFAULT_RULES,
	parseRules,
	readGuardrails,
	saveGuardrails,
} from "./guardrails.service.ts";

export interface GuardrailsDeps {
	db: Db;
	now: () => number;
}

/** Admin routes for the prompt-injection filter. Auth is enforced by the app's `onRequest` guard. */
export function guardrailsRoutes({ db, now }: GuardrailsDeps) {
	const view = () => ({ ...readGuardrails(db), defaults: DEFAULT_RULES });
	return new Elysia({
		prefix: "/v1/admin/guardrails",
		tags: ["Admin: guardrails"],
	})
		.get("/", view, {
			response: { 200: GuardrailsView },
			detail: {
				summary: "Prompt-injection guardrails",
				description:
					"`enabled` (off until staff turn it on), the rules (one JS regex per line, `#` comments) and the built-in `defaults`.",
			},
		})
		.put(
			"/",
			({ body, request, status }) => {
				const { errors } = parseRules(body.rules);
				if (errors.length > 0) return status(422, { errors });
				saveGuardrails(db, body, adminIdOf(request), now());
				return view();
			},
			{
				body: GuardrailsBody,
				response: { 200: GuardrailsView, 422: GuardrailsErrors },
				detail: {
					summary: "Save the guardrails",
					description:
						"Every rule line is checked (valid regex, <= 500 chars, <= 500 rules). 422 `{ errors: [{ line, message }] }` and nothing is saved when any is wrong.",
				},
			},
		);
}
