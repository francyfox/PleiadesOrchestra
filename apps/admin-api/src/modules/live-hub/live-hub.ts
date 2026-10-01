/** What a subscriber hears: the current data, or that the source is unavailable. */
export type HubEvent =
	| { type: "data"; data: unknown }
	| { type: "error"; code: "upstream" };

export type HubListener = (event: HubEvent) => void;

export interface HubTopic {
	intervalMs: number;
	/** Whether `params` are acceptable for this topic. */
	validate(params: unknown): boolean;
	/** The current data for `params`; a rejection is an upstream outage. */
	fetch(params: unknown): Promise<unknown>;
}

export type SubscribeResult =
	| { ok: true; unsubscribe: () => void }
	| { ok: false; code: "unknown_topic" | "invalid_params" };

export interface LiveHubOptions {
	topics: Record<string, HubTopic>;
	setInterval?: (fn: () => void, ms: number) => unknown;
	clearInterval?: (id: unknown) => void;
}

/** JSON with object keys sorted at every depth, so equal data always serialises equally. */
function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

/** A hash of `value` that ignores key order — equal hashes mean "nothing new to send". */
export function stableHash(value: unknown): string {
	return Bun.hash(stableStringify(value)).toString(36);
}

interface Entry {
	listener: HubListener;
	/** Has this listener received a snapshot it can rely on (since the last outage)? */
	primed: boolean;
}

interface Group {
	topic: HubTopic;
	params: unknown;
	entries: Set<Entry>;
	timer: unknown;
	inflight: boolean;
	closed: boolean;
	failed: boolean;
	hash?: string;
	cache?: { data: unknown };
}

/**
 * Live data for admin pages. Subscriptions are grouped by topic + params; a
 * group runs ONE fetch timer while anybody listens, and pushes to its
 * listeners only when the data changed. A listener first receives a snapshot
 * (the group's cached one at once, otherwise as soon as the first fetch
 * lands), then changes only. An outage is reported once, and the first
 * success after it re-sends the data, since listeners may have gone stale.
 */
export function createLiveHub({
	topics,
	setInterval: start = (fn, ms) => globalThis.setInterval(fn, ms),
	clearInterval: stop = (id) =>
		globalThis.clearInterval(id as ReturnType<typeof setInterval>),
}: LiveHubOptions) {
	const groups = new Map<string, Group>();

	async function refresh(group: Group) {
		if (group.inflight || group.closed) return;
		group.inflight = true;
		try {
			const data = await group.topic.fetch(group.params);
			if (group.closed) return;
			const hash = stableHash(data);
			const changed = hash !== group.hash;
			group.hash = hash;
			group.cache = { data };
			group.failed = false;
			for (const entry of [...group.entries]) {
				if (changed || !entry.primed) {
					entry.primed = true;
					entry.listener({ type: "data", data });
				}
			}
		} catch {
			if (group.closed) return;
			if (!group.failed) {
				group.failed = true;
				for (const entry of [...group.entries]) {
					entry.primed = false;
					entry.listener({ type: "error", code: "upstream" });
				}
			}
		} finally {
			group.inflight = false;
		}
	}

	return {
		subscribe(
			topicName: string,
			params: unknown,
			listener: HubListener,
		): SubscribeResult {
			const topic = topics[topicName];
			if (!topic) return { ok: false, code: "unknown_topic" };
			if (!topic.validate(params)) return { ok: false, code: "invalid_params" };

			const key = `${topicName}\u0000${stableStringify(params)}`;
			let group = groups.get(key);
			const fresh = !group;
			if (!group) {
				group = {
					topic,
					params,
					entries: new Set(),
					timer: undefined,
					inflight: false,
					closed: false,
					failed: false,
				};
				groups.set(key, group);
			}
			const current = group;

			const entry: Entry = { listener, primed: false };
			current.entries.add(entry);
			if (current.failed) {
				listener({ type: "error", code: "upstream" });
			} else if (current.cache) {
				entry.primed = true;
				listener({ type: "data", data: current.cache.data });
			}
			if (fresh) {
				current.timer = start(() => void refresh(current), topic.intervalMs);
				void refresh(current);
			}

			return {
				ok: true,
				unsubscribe() {
					if (!current.entries.delete(entry) || current.entries.size > 0)
						return;
					current.closed = true;
					stop(current.timer);
					groups.delete(key);
				},
			};
		},
	};
}

export type LiveHub = ReturnType<typeof createLiveHub>;
