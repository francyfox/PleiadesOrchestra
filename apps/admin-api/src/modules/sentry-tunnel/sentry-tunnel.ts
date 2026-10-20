import { resolveClientIp } from "@repo/elysia-kit";
import { Elysia } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { tunnelTarget } from "./sentry-tunnel.service.ts";

/** Envelopes are events and feedback with a screenshot: a few MB at most. */
const MAX_ENVELOPE_BYTES = 10 * 1024 * 1024;

/**
 * `POST /monitoring/tunnel`: the panel's Sentry SDK sends here instead of
 * `*.ingest.sentry.io`, which ad blockers drop. No session — errors on the
 * sign-in pages count too; the origin guard and the DSN check still apply.
 */
export function sentryTunnelRoutes({ sentryTunnel, clientIp }: RouteDeps) {
	return new Elysia({
		name: "admin-api.sentry-tunnel",
		tags: ["monitoring"],
	}).post(
		"/monitoring/tunnel",
		async ({ request, server, status }) => {
			if (!sentryTunnel) return status(404, { error: "not_found" });
			const bytes = new Uint8Array(await request.arrayBuffer());
			if (bytes.length > MAX_ENVELOPE_BYTES) {
				return status(413, { error: "too_large" });
			}
			// The header line is JSON text even when an item (a screenshot) is binary.
			const target = tunnelTarget(
				new TextDecoder().decode(bytes),
				sentryTunnel.dsn,
			);
			if (!target) return status(403, { error: "forbidden" });
			const upstream = await (sentryTunnel.fetch ?? fetch)(target, {
				method: "POST",
				headers: {
					"content-type": "application/x-sentry-envelope",
					// Sentry would otherwise record this server's IP as the user's.
					"x-forwarded-for":
						resolveClientIp({
							source: clientIp.source,
							hops: clientIp.hops,
							headers: request.headers,
							socketIp: server?.requestIP(request)?.address,
						}) ?? "",
				},
				body: bytes,
			});
			return new Response(upstream.body, { status: upstream.status });
		},
		{
			parse: "none",
			detail: {
				summary: "Forward a Sentry envelope from the panel",
				description:
					"Only envelopes for the panel's own DSN (`SENTRY_TUNNEL_DSN`); 404 when it is unset, 403 for any other DSN.",
			},
		},
	);
}
