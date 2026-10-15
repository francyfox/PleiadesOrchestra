import type { FetchContext } from "../common/common.types.ts";
import type {
	RequestsPage,
	RequestsQuery,
	RequestView,
} from "./requests.schema.ts";
import { buildWebMcpTrace, channelOf } from "./requests.trace.ts";
import { buildRequestView } from "./requests.view.ts";

type Orchestrator = Pick<FetchContext, "orchestrator">;

/** `GET /api/requests`: the requests table, newest first. */
export function fetchRequests(
	{ orchestrator }: Orchestrator,
	query: RequestsQuery,
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

/** `GET /api/requests/:id/trace`: the request as a Model Context Tool Inspector export. */
export async function fetchRequestTrace(
	{ orchestrator }: Orchestrator,
	id: string,
): Promise<unknown[]> {
	const details = await orchestrator.getRequest(id);
	const channel = channelOf(details);
	const { items } = channel ? await orchestrator.listMcp() : { items: [] };
	const tools = items.find((site) => site.channelId === channel)?.tools ?? [];
	return buildWebMcpTrace(details, tools);
}
