import { APIError } from "better-auth/api";
import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { deleteAccount } from "../accounts/accounts.service.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { ApiError } from "../common/common.schema.ts";
import { Upstream } from "../orchestrator/orchestrator.schema.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import { CustomersPage, CustomersQuery } from "./customers.schema.ts";
import { fetchCustomersPage, findCustomer } from "./customers.service.ts";

const Params = t.Object({ id: t.String() });
const Ok = t.Object({ id: t.String() });
const Failures = {
	401: ApiError,
	403: ApiError,
	404: ApiError,
	502: ApiError,
	503: ApiError,
	500: ApiError,
};

/** Staff "Users" page: the customer accounts (level 200). Staff only; ids that are not customers are 404. */
export function customersRoutes({ auth, db, orchestrator }: RouteDeps) {
	return new Elysia({
		name: "admin-api.customers",
		prefix: "/accounts",
		tags: ["accounts"],
	})
		.use(orchestratorErrors)
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get(
					"/",
					({ query }) => fetchCustomersPage({ db, orchestrator }, query),
					{
						query: CustomersQuery,
						response: { 200: CustomersPage, ...Upstream },
						detail: {
							summary: "List customer accounts",
							description:
								"Level-200 accounts, oldest first. `pageSize` omitted → every account; `total` always counts all of them.",
						},
					},
				)
				.delete(
					"/:id",
					async ({ params, admin, status }) => {
						if (!(await findCustomer(db, params.id))) {
							return status(404, { error: "not_found" });
						}
						await deleteAccount({ db, orchestrator }, params.id, admin.id);
						return { id: params.id };
					},
					{
						params: Params,
						response: { 200: Ok, ...Failures },
						detail: {
							summary: "Delete a customer account",
							description:
								"Deletes the account, its sessions and its channels with their visitors' data. If the orchestrator cannot delete the channels the answer is 502/503 and the account is kept.",
						},
					},
				)
				.post(
					"/:id/ban",
					async ({ params, request, status }) => {
						if (!(await findCustomer(db, params.id))) {
							return status(404, { error: "not_found" });
						}
						try {
							await auth.api.banUser({
								headers: request.headers,
								body: { userId: params.id },
							});
						} catch (cause) {
							if (cause instanceof APIError)
								return status(500, { error: "ban_failed" });
							throw cause;
						}
						return { id: params.id };
					},
					{
						params: Params,
						response: { 200: Ok, ...Failures },
						detail: {
							summary: "Ban a customer",
							description:
								"Drops their sessions and refuses sign-in. Their channels keep running (suspension is billing's job).",
						},
					},
				)
				.post(
					"/:id/unban",
					async ({ params, request, status }) => {
						if (!(await findCustomer(db, params.id))) {
							return status(404, { error: "not_found" });
						}
						try {
							await auth.api.unbanUser({
								headers: request.headers,
								body: { userId: params.id },
							});
						} catch (cause) {
							if (cause instanceof APIError)
								return status(500, { error: "ban_failed" });
							throw cause;
						}
						return { id: params.id };
					},
					{
						params: Params,
						response: { 200: Ok, ...Failures },
						detail: { summary: "Unban a customer" },
					},
				),
		);
}
