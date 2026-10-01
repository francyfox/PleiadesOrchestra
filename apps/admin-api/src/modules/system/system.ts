import { Elysia } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { isForeignOrigin } from "../origin-guard/origin-guard.service.ts";
import { SystemSnapshot } from "./system.schema.ts";

/**
 * The host's CPU / RAM / GPU, read from `/proc` and `/sys` (not namespaced
 * by Docker, so this container sees the host's). `GET /system` serves the
 * first paint; the header meter then follows `/system/stream`.
 */
export function systemRoutes({
	auth,
	systemSnapshot,
	systemFeed,
	trustedOrigins,
}: RouteDeps) {
	const unsubscribe = new Map<string, () => void>();

	return new Elysia({ name: "admin-api.system", tags: ["system"] })
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.get("/system", () => systemSnapshot(), {
					response: SystemSnapshot,
					detail: { summary: "Host hardware snapshot" },
				})
				// Declared after `/system` on purpose: hooks only cover later routes.
				.onBeforeHandle(({ request }) => {
					if (isForeignOrigin(request, trustedOrigins)) {
						return Response.json(
							{ error: "forbidden_origin" },
							{ status: 403 },
						);
					}
				})
				.ws("/system/stream", {
					response: SystemSnapshot,
					open(ws) {
						systemSnapshot().then(
							(snapshot) => ws.send(snapshot),
							() => {},
						);
						unsubscribe.set(
							ws.id,
							systemFeed.subscribe((snapshot) => ws.send(snapshot)),
						);
					},
					close(ws) {
						unsubscribe.get(ws.id)?.();
						unsubscribe.delete(ws.id);
					},
					detail: {
						summary: "Live host hardware snapshots (WebSocket)",
						description:
							"One `SystemSnapshot` on open, then one per `SYSTEM_STREAM_INTERVAL_MS` while connected. Needs the session cookie; a foreign `Origin` is refused (403). Sampling stops when the last client disconnects.",
					},
				}),
		);
}
