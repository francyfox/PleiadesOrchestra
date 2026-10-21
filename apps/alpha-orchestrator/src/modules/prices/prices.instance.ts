import { createPriceBook } from "./prices.service.ts";

/** Shared by the usage routes and the usage recorder's per-call debit. */
export const priceBook = createPriceBook();
