import { Elysia } from "elysia";
import type { RouteDeps } from "../app.ts";
import type { LiveErrorCode, LiveServerMessage } from "../live/protocol.ts";
import { requireAdmin } from "../plugins.ts";
import { isForeignOrigin } from "../security.ts";

/** Subscriptions one socket may hold: a page needs a handful, so this only stops runaways. */
const MAX_SUBSCRIPTIONS = 20;
const MAX_ID_LENGTH = 64;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** A client message as an object: WebSocket frames arrive as text, bytes, or already-parsed JSON. */
function parse(raw: unknown): unknown {
	try {
		if (typeof raw === "string") return JSON.parse(raw);
		if (raw instanceof Uint8Array) {
			return JSON.parse(new TextDecoder().decode(raw));
		}
	} catch {
		return undefined;
	}
	return raw;
}

const validId = (value: unknown): value is string =>
	typeof value === "string" &&
	value.length > 0 &&
	value.length <= MAX_ID_LENGTH;

/**
 * One multiplexed WebSocket per browser tab. A page subscribes to the data it
 * shows (`subscribe {id, topic, params}`) and drops the subscription when it
 * is left (`unsubscribe {id}`); the hub pushes a snapshot, then only changes
 * (see live/hub.ts). Bad input is answered with an `error` message and never
 * closes the socket.
 */
export function liveRoutes({ auth, liveHub, trustedOrigins }: RouteDeps) {
	/** Per socket: subscription id → its unsubscribe. */
	const sockets = new Map<string, Map<string, () => void>>();

	return new Elysia({ name: "admin-api.live", tags: ["live"] })
		.use(requireAdmin(auth))
		.guard({ admin: true }, (app) =>
			app
				.onBeforeHandle(({ request }) => {
					if (isForeignOrigin(request, trustedOrigins)) {
						return Response.json(
							{ error: "forbidden_origin" },
							{ status: 403 },
						);
					}
				})
				.ws("/live", {
					open(ws) {
						sockets.set(ws.id, new Map());
					},
					message(ws, raw) {
						const subscriptions = sockets.get(ws.id);
						if (!subscriptions) return;
						// Elysia sends a `message` handler's return value to the client too: keep every path void.
						const send = (message: LiveServerMessage): void => {
							ws.send(message);
						};
						const refuse = (id: string, code: LiveErrorCode): void => {
							send({ type: "error", id, code });
						};

						const message = parse(raw);
						if (!isRecord(message)) return refuse("", "invalid_params");
						const { id } = message;
						if (!validId(id)) return refuse("", "invalid_params");

						if (message.type === "unsubscribe") {
							subscriptions.get(id)?.();
							subscriptions.delete(id);
							return;
						}
						if (
							message.type !== "subscribe" ||
							typeof message.topic !== "string"
						) {
							return refuse(id, "invalid_params");
						}

						// Same id again = replace: the page moved on to other params.
						subscriptions.get(id)?.();
						subscriptions.delete(id);
						if (subscriptions.size >= MAX_SUBSCRIPTIONS) {
							return refuse(id, "invalid_params");
						}

						const result = liveHub.subscribe(
							message.topic,
							message.params,
							(event) =>
								event.type === "data"
									? send({ type: "data", id, data: event.data })
									: send({ type: "error", id, code: event.code }),
						);
						if (!result.ok) return refuse(id, result.code);
						subscriptions.set(id, result.unsubscribe);
					},
					close(ws) {
						for (const unsubscribe of sockets.get(ws.id)?.values() ?? []) {
							unsubscribe();
						}
						sockets.delete(ws.id);
					},
					detail: {
						summary: "Live page data (WebSocket, one per browser tab)",
						description:
							"Client sends `{type:'subscribe', id, topic, params}` / `{type:'unsubscribe', id}`; topics: dashboard, users, user, channels, blocked-ips, admins, agents, performance (see `live/protocol.ts`). The server answers `{type:'data', id, data}` — the body of the matching REST endpoint — once on subscribe and then only when it changed, or `{type:'error', id, code}` (`unknown_topic`, `invalid_params`, `upstream` once per outage). A source is polled only while somebody watches it. Needs the session cookie; a foreign `Origin` is refused (403).",
					},
				}),
		);
}
