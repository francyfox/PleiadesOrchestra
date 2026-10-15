import { queryOptions } from "@tanstack/svelte-query";
import type { LiveTopics } from "admin-api/types";
import { api } from "#lib/api/client.js";
import { unwrap } from "#lib/api/result.js";
import type { Persona } from "#lib/api-types.js";
import { SYSTEM_KEY, topicKey } from "./keys";

/** Data the WebSocket keeps current: never stale by itself; a mutation still invalidates it. */
const pushed = { staleTime: Number.POSITIVE_INFINITY } as const;

/**
 * One entry per live topic: the REST call that first fills the cache entry,
 * under the very key the topic's pushes are written to (`topicKey`), so a page
 * reads with `createQuery` and the socket updates it in place.
 */
export const liveQueries = {
	dashboard: (params: LiveTopics["dashboard"]["params"]) =>
		queryOptions({
			queryKey: topicKey("dashboard", params),
			queryFn: () => unwrap(api().dashboard.get()),
			...pushed,
		}),
	users: (params: LiveTopics["users"]["params"]) =>
		queryOptions({
			queryKey: topicKey("users", params),
			queryFn: () => unwrap(api().users.get({ query: params })),
			...pushed,
		}),
	user: (params: LiveTopics["user"]["params"]) =>
		queryOptions({
			queryKey: topicKey("user", params),
			queryFn: () => unwrap(api().users({ id: params.id }).get()),
			...pushed,
		}),
	channels: (params: LiveTopics["channels"]["params"]) =>
		queryOptions({
			queryKey: topicKey("channels", params),
			queryFn: () => unwrap(api().channels.get({ query: params })),
			...pushed,
		}),
	"blocked-ips": (params: LiveTopics["blocked-ips"]["params"]) =>
		queryOptions({
			queryKey: topicKey("blocked-ips", params),
			queryFn: () => unwrap(api()["blocked-ips"].get({ query: params })),
			...pushed,
		}),
	intents: (params: LiveTopics["intents"]["params"]) =>
		queryOptions({
			queryKey: topicKey("intents", params),
			queryFn: () => unwrap(api().intents.get({ query: params })),
			...pushed,
		}),
	admins: (params: LiveTopics["admins"]["params"]) =>
		queryOptions({
			queryKey: topicKey("admins", params),
			queryFn: () => unwrap(api().admins.get({ query: params })),
			...pushed,
		}),
	agents: (params: LiveTopics["agents"]["params"]) =>
		queryOptions({
			queryKey: topicKey("agents", params),
			queryFn: () => unwrap(api().agents.get()),
			...pushed,
		}),
	performance: (params: LiveTopics["performance"]["params"]) =>
		queryOptions({
			queryKey: topicKey("performance", params),
			queryFn: () => unwrap(api().performance.get({ query: params })),
			...pushed,
		}),
	requests: (params: LiveTopics["requests"]["params"]) =>
		queryOptions({
			queryKey: topicKey("requests", params),
			queryFn: () => unwrap(api().requests.get({ query: params })),
			...pushed,
		}),
	mcp: (params: LiveTopics["mcp"]["params"]) =>
		queryOptions({
			queryKey: topicKey("mcp", params),
			queryFn: () => unwrap(api().mcp.get()),
			...pushed,
		}),
	request: (params: LiveTopics["request"]["params"]) =>
		queryOptions({
			queryKey: topicKey("request", params),
			queryFn: () => unwrap(api().requests({ id: params.id }).get()),
			...pushed,
		}),
};

/** Everything that is not pushed over `/api/live`. */
export const queries = {
	requestTrace: (id: string) =>
		queryOptions({
			queryKey: ["request-trace", id],
			queryFn: () => unwrap(api().requests({ id }).trace.get()),
			staleTime: 0,
		}),
	session: () =>
		queryOptions({
			queryKey: ["session"],
			queryFn: () => unwrap(api().session.get()),
		}),
	system: () =>
		queryOptions({
			queryKey: SYSTEM_KEY,
			queryFn: () => unwrap(api().system.get()),
			...pushed,
		}),
	/** Every channel, unpaged: what the forms' selects list. Not pushed, so it follows the usual freshness rules. */
	allChannels: () =>
		queryOptions({
			queryKey: ["channels", "all"],
			queryFn: () => unwrap(api().channels.get({ query: {} })),
		}),
	/** A channel's persona; asked only while its dialog is open and always fresh (an edit elsewhere must not be overwritten by a stale form). */
	persona: (channelId: string) =>
		queryOptions({
			queryKey: ["channels", channelId, "persona"],
			queryFn: () => unwrap(api().channels({ id: channelId }).persona.get()),
			staleTime: 0,
		}),
	/** The prompt the unsaved dialog values would produce (server-built, so the preview is never a copy of its rules). */
	personaPreview: (channelId: string, draft: Persona) =>
		queryOptions({
			queryKey: ["channels", channelId, "persona", "preview", draft],
			queryFn: () =>
				unwrap(api().channels({ id: channelId }).persona.preview.post(draft)),
			staleTime: 0,
			placeholderData: (previous) => previous,
		}),
};
