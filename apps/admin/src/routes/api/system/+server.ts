import { json } from "@sveltejs/kit";
import { systemSnapshot } from "$lib/server/system/snapshot";
import type { RequestHandler } from "./$types";

/** Polled by the header's system meter. Behind the same session check as every page. */
export const GET: RequestHandler = async () => json(await systemSnapshot());
