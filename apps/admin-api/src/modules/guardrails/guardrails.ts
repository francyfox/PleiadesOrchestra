import { Elysia } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { OrchestratorError } from "../orchestrator/orchestrator.ts";
import {
	Guardrails,
	GuardrailsErrors,
	GuardrailsInput,
} from "./guardrails.schema.ts";

export function guardrailsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.guardrails", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/guardrails", () => orchestrator.guardrails(), {
					response: { 200: Guardrails, ...Upstream },
					detail: { summary: "Prompt-injection guardrails" },
				})
				.put(
					"/guardrails",
					async ({ body, admin, status }) => {
						try {
							return await orchestrator.as(admin.id).saveGuardrails(body);
						} catch (error) {
							// The per-line errors are the page's feedback, not a fault.
							if (error instanceof OrchestratorError && error.status === 422)
								return status(422, error.body as GuardrailsErrors);
							throw error;
						}
					},
					{
						body: GuardrailsInput,
						response: { 200: Guardrails, 422: GuardrailsErrors, ...Upstream },
						detail: {
							summary: "Save the guardrails",
							description:
								"422 `{ errors: [{ line, message }] }` when a rule line is not a valid, short enough regex; nothing is saved.",
						},
					},
				),
		);
}
