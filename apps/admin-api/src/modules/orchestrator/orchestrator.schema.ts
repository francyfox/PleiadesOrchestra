import { t } from "elysia";
import { ApiError } from "../common/common.schema.ts";

export const IdParams = t.Object({ id: t.String() });

/** Error responses every route that calls the orchestrator can produce. */
export const Upstream = {
	401: ApiError,
	404: ApiError,
	502: ApiError,
	503: ApiError,
} as const;

/** `Upstream` plus the 404 of an item that is not yours; spelled out (no `as const`) so `status(404, …)` type-checks. */
export const OwnedUpstream = {
	401: ApiError,
	404: ApiError,
	502: ApiError,
	503: ApiError,
};
