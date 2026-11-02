import { Elysia } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { FinanceRates } from "./finance.schema.ts";

export function financeRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.finance", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/finance/rates", async () => orchestrator.financeRates(), {
					response: { 200: FinanceRates, ...Upstream },
					detail: {
						summary: "Rates of the staff finance numbers",
						description:
							"Percent (fixed fee in USD); the defaults until saved.",
					},
				})
				.put(
					"/finance/rates",
					({ body, admin }) => orchestrator.as(admin.id).saveFinanceRates(body),
					{
						body: FinanceRates,
						response: { 200: FinanceRates, ...Upstream },
						detail: { summary: "Save the finance rates" },
					},
				),
		);
}
