import type { FetchContext } from "../common/common.types.ts";
import type { RequestsPage, RequestView } from "./requests.schema.ts";
import { buildRequestView } from "./requests.view.ts";

type Orchestrator = Pick<FetchContext, "orchestrator">;

/** `GET /api/requests`: the requests table, newest first. */
export function fetchRequests(
	{ orchestrator }: Orchestrator,
	query: { page?: number; pageSize?: number },
): Promise<RequestsPage> {
	return orchestrator.listRequests(query);
}

/** `GET /api/requests/:id`: one request, already shaped for drawing. */
export async function fetchRequestView(
	{ orchestrator }: Orchestrator,
	id: string,
): Promise<RequestView> {
	return buildRequestView(await orchestrator.getRequest(id));
}
