import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError, PageQuery } from "../common/common.schema.ts";
import { IdParams, Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { BlockedIp, CreateBlockedIpInput } from "./blocked-ips.schema.ts";
import { cleanBlockedIp } from "./blocked-ips.service.ts";

export function blockedIpsRoutes({ auth, orchestrator }: RouteDeps) {
	return new Elysia({ name: "admin-api.blocked-ips", tags: ["orchestrator"] })
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get(
					"/blocked-ips",
					({ query }) => orchestrator.listBlockedIps(query),
					{
						query: PageQuery,
						response: {
							200: t.Object({ items: t.Array(BlockedIp), total: t.Number() }),
							...Upstream,
						},
						detail: {
							summary: "List blocked IPs, newest first",
							description:
								"Blocks match by IP hash; the plaintext `ip` is kept for display only (null on older rows).",
						},
					},
				)
				.post(
					"/blocked-ips",
					async ({ body, admin, status }) => {
						const block = cleanBlockedIp(body);
						if (!block) return status(400, { error: "invalid_block" });
						return orchestrator.as(admin.id).createBlockedIp(block);
					},
					{
						body: CreateBlockedIpInput,
						response: {
							200: t.Object({ item: BlockedIp }),
							400: ApiError,
							...Upstream,
						},
						detail: { summary: "Block an IP" },
					},
				)
				.delete(
					"/blocked-ips/:id",
					async ({ params, admin, set }) => {
						await orchestrator.as(admin.id).deleteBlockedIp(params.id);
						set.status = 204;
					},
					{ params: IdParams, detail: { summary: "Unblock an IP" } },
				),
		);
}
