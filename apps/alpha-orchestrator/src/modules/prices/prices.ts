import { Elysia, t } from "elysia";
import type { Db } from "../database/database.ts";
import { LocalPriceInput, LocalPrices } from "./prices.schema.ts";
import {
	deleteLocalPrice,
	listLocalPrices,
	saveLocalPrice,
} from "./prices.service.ts";

/** Staff prices of local models (admin-api only lets staff reach it). */
export function pricesRoutes({ db }: { db: Db }) {
	const list = () => ({ items: listLocalPrices(db) });
	return new Elysia({
		prefix: "/v1/admin/local-prices",
		tags: ["Admin: usage & stats"],
	})
		.get("/", list, {
			response: { 200: LocalPrices },
			detail: {
				summary: "Prices of local models",
				description:
					"USD per 1M tokens (input, output, cached input). A model listed here is billed at this price even if OpenRouter lists it too.",
			},
		})
		.put(
			"/:model",
			({ params, body }) => {
				saveLocalPrice(db, params.model, body);
				return list();
			},
			{
				params: t.Object({ model: t.String({ minLength: 1 }) }),
				body: LocalPriceInput,
				response: { 200: LocalPrices },
				detail: { summary: "Add or change the price of a local model" },
			},
		)
		.delete(
			"/:model",
			({ params }) => {
				deleteLocalPrice(db, params.model);
				return list();
			},
			{
				params: t.Object({ model: t.String({ minLength: 1 }) }),
				response: { 200: LocalPrices },
				detail: { summary: "Remove the price of a local model" },
			},
		);
}
