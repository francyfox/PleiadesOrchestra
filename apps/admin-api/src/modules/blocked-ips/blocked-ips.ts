import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { mayAccessChannel, ownerScope } from "../channels/channels.service.ts";
import { ApiError, PageQuery } from "../common/common.schema.ts";
import {
	IdParams,
	OwnedUpstream,
	Upstream,
} from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { BlockedIp, CreateBlockedIpInput } from "./blocked-ips.schema.ts";
import { cleanBlockedIp, mayDeleteBlock } from "./blocked-ips.service.ts";

/**
 * Blocked IPs. Staff see and set every block, global ones included; a user
 * only blocks of their own channels: a block they create must name one, and
 * another owner's channel or block is 404 `not_found`.
 */
export function blockedIpsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.blocked-ips", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ account: true }, (app) =>
			app
				.get(
					"/blocked-ips",
					({ query, account }) =>
						orchestrator.listBlockedIps({
							...query,
							ownerId: ownerScope(account),
						}),
					{
						query: PageQuery,
						response: {
							200: t.Object({ items: t.Array(BlockedIp), total: t.Number() }),
							...Upstream,
						},
						detail: {
							summary: "List blocked IPs, newest first",
							description:
								"Blocks match by IP hash; the plaintext `ip` is kept for display only (null on older rows). A user gets only blocks of their own channels (no global ones).",
						},
					},
				)
				.post(
					"/blocked-ips",
					async ({ body, account, status }) => {
						const block = cleanBlockedIp(body);
						// Only staff block globally (no channel).
						if (!block || (ownerScope(account) && !block.channelId)) {
							return status(400, { error: "invalid_block" });
						}
						if (
							block.channelId &&
							!(await mayAccessChannel(orchestrator, account, block.channelId))
						) {
							return status(404, { error: "not_found" });
						}
						return orchestrator.as(account.id).createBlockedIp(block);
					},
					{
						body: CreateBlockedIpInput,
						response: {
							200: t.Object({ item: BlockedIp }),
							400: ApiError,
							...OwnedUpstream,
						},
						detail: {
							summary: "Block an IP",
							description:
								"Without `channelId` the block is global (staff only); a user must name one of their channels.",
						},
					},
				)
				.delete(
					"/blocked-ips/:id",
					async ({ params, account, status, set }) => {
						if (!(await mayDeleteBlock(orchestrator, account, params.id))) {
							return status(404, { error: "not_found" });
						}
						await orchestrator.as(account.id).deleteBlockedIp(params.id);
						set.status = 204;
					},
					{
						params: IdParams,
						response: { 404: ApiError },
						detail: { summary: "Unblock an IP" },
					},
				),
		);
}
