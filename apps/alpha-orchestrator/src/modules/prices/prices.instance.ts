import { db } from "../database/database.instance.ts";
import { createPriceBook, readLocalPrices } from "./prices.service.ts";

/** Shared by the usage routes and the usage recorder's per-call debit. */
export const priceBook = createPriceBook({ local: () => readLocalPrices(db) });
