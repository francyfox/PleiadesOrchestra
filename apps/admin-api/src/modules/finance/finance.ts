import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { LocalPriceInput } from "../../forms/forms.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { FinanceRates, LocalPrices } from "./finance.schema.ts";

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
				)
				.get("/finance/local-prices", async () => orchestrator.localPrices(), {
					response: { 200: LocalPrices, ...Upstream },
					detail: {
						summary: "Prices of local models",
						description: "USD per 1M tokens; an entry wins over OpenRouter's.",
					},
				})
				.put(
					"/finance/local-prices/:model",
					({ params, body, admin }) =>
						orchestrator.as(admin.id).saveLocalPrice(params.model, body),
					{
						params: t.Object({ model: t.String({ minLength: 1 }) }),
						body: LocalPriceInput,
						response: { 200: LocalPrices, ...Upstream },
						detail: { summary: "Add or change the price of a local model" },
					},
				)
				.delete(
					"/finance/local-prices/:model",
					({ params, admin }) =>
						orchestrator.as(admin.id).deleteLocalPrice(params.model),
					{
						params: t.Object({ model: t.String({ minLength: 1 }) }),
						response: { 200: LocalPrices, ...Upstream },
						detail: { summary: "Remove the price of a local model" },
					},
				),
		);
}
