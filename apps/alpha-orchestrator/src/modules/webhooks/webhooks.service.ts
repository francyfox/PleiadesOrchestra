import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, desc, eq } from "drizzle-orm";
import { channels, webhooks } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import {
	type DeliveryResult,
	type Resolve,
	WEBHOOK_EVENT_SCOPE,
	type WebhookEvent,
	type WebhookEventData,
	type WebhookFormat,
} from "./webhooks.types.ts";

export class UnsafeWebhookUrlError extends Error {}

export type WebhookRow = typeof webhooks.$inferSelect;

/** The row without its secret: what lists and updates return. */
export function publicWebhook({ secret: _secret, ...rest }: WebhookRow) {
	return rest;
}

const TIMEOUT_MS = 5000;
const ATTEMPTS = 3;

// --- SSRF guard (trust boundary: the admin picks the URL, the server calls it) ---

/** Eight 16-bit groups of an IPv6 literal; `::` expanded, an embedded dotted IPv4 turned into two groups. */
function v6Groups(address: string): number[] {
	let text = address.toLowerCase().split("%")[0] ?? "";
	const dotted = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (dotted) {
		const [, a, b, c, d] = dotted.map(Number);
		text = text.replace(
			dotted[0],
			`${(((a ?? 0) << 8) | (b ?? 0)).toString(16)}:${(((c ?? 0) << 8) | (d ?? 0)).toString(16)}`,
		);
	}
	const [head = "", tail] = text.split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const fill =
		tail === undefined ? [] : Array(8 - left.length - right.length).fill("0");
	return [...left, ...fill, ...right].map((g) => Number.parseInt(g, 16));
}

function privateV4(a: number, b: number): boolean {
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		a >= 224 || // multicast and reserved
		(a === 100 && b >= 64 && b <= 127) || // CGNAT
		(a === 169 && b === 254) || // link-local, cloud metadata
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && (b === 168 || b === 0)) ||
		(a === 198 && (b === 18 || b === 19))
	);
}

/** True for loopback, private, link-local, metadata, multicast and unspecified addresses (and for anything that is not an IP). */
export function isPrivateAddress(address: string): boolean {
	const kind = isIP(address);
	if (kind === 4) {
		const [a = 0, b = 0] = address.split(".").map(Number);
		return privateV4(a, b);
	}
	if (kind !== 6) return true;
	const g = v6Groups(address);
	const embedded = (hi = 0) => privateV4(hi >> 8, hi & 255);
	// ::ffff:a.b.c.d and ::a.b.c.d (so :: and ::1 too)
	if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
		return embedded(g[6]);
	}
	if (g[0] === 0x64 && g[1] === 0xff9b) return embedded(g[6]); // NAT64
	return (
		((g[0] ?? 0) & 0xfe00) === 0xfc00 || // unique local
		((g[0] ?? 0) & 0xffc0) === 0xfe80 || // link-local
		((g[0] ?? 0) & 0xff00) === 0xff00 // multicast
	);
}

export const dnsResolve: Resolve = async (host) =>
	(await lookup(host, { all: true })).map((entry) => entry.address);

export interface GuardDeps {
	resolve?: Resolve;
	/** Dev only: allows http and private addresses. */
	allowPrivate?: boolean;
}

/**
 * Throws `UnsafeWebhookUrlError` unless the URL is https and every address its host
 * resolves to is public. Run on registration and again before every delivery.
 * shortcut: the name is resolved again by `fetch`, so a rebinding DNS can still slip
 * between check and connect; upgrade: connect to the checked IP.
 */
export async function assertPublicUrl(
	raw: string,
	{ resolve = dnsResolve, allowPrivate = false }: GuardDeps = {},
): Promise<URL> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new UnsafeWebhookUrlError("Not a valid URL");
	}
	if (allowPrivate) {
		if (url.protocol !== "https:" && url.protocol !== "http:") {
			throw new UnsafeWebhookUrlError("Only http(s) URLs are allowed");
		}
		return url;
	}
	if (url.protocol !== "https:") {
		throw new UnsafeWebhookUrlError("Only https URLs are allowed");
	}
	const host = url.hostname.replace(/^\[|\]$/g, "");
	let addresses: string[];
	try {
		addresses = isIP(host) ? [host] : await resolve(host);
	} catch {
		throw new UnsafeWebhookUrlError("Host does not resolve");
	}
	if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
		throw new UnsafeWebhookUrlError(
			"Private or local addresses are not allowed",
		);
	}
	return url;
}

// --- storage ---

/** A customer may own this many webhooks. */
export const MAX_CUSTOMER_WEBHOOKS = 5;

export class WebhookRuleError extends Error {}

/**
 * `ownerId` set = a customer's view: only their rows (a foreign id is simply absent).
 * Left out = staff, who see and manage every webhook.
 */
const scope = (id: string | undefined, ownerId: string | undefined) =>
	and(
		id === undefined ? undefined : eq(webhooks.id, id),
		ownerId === undefined ? undefined : eq(webhooks.ownerId, ownerId),
	);

export function listWebhooks(db: Db, ownerId?: string): WebhookRow[] {
	return db
		.select()
		.from(webhooks)
		.where(scope(undefined, ownerId))
		.orderBy(desc(webhooks.createdAt))
		.all();
}

export function getWebhook(
	db: Db,
	id: string,
	ownerId?: string,
): WebhookRow | undefined {
	return db.select().from(webhooks).where(scope(id, ownerId)).get();
}

const newSecret = () =>
	`whsec_${(crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "")}`;

/** A customer may not subscribe to staff events, staff not to owner ones (the balance). */
function assertEventsAllowed(events: string[], ownerId: string | undefined) {
	const hidden = ownerId === undefined ? "owner" : "staff";
	if (events.some((e) => WEBHOOK_EVENT_SCOPE[e as WebhookEvent] === hidden)) {
		throw new WebhookRuleError("Event not available");
	}
}

export function createWebhook(
	db: Db,
	input: {
		name?: string;
		url: string;
		events: WebhookEvent[];
		format?: WebhookFormat;
		ownerId?: string;
	},
	now: number,
): WebhookRow {
	assertEventsAllowed(input.events, input.ownerId);
	if (
		input.ownerId !== undefined &&
		listWebhooks(db, input.ownerId).length >= MAX_CUSTOMER_WEBHOOKS
	) {
		throw new WebhookRuleError(
			`At most ${MAX_CUSTOMER_WEBHOOKS} webhooks per account`,
		);
	}
	return db
		.insert(webhooks)
		.values({
			id: crypto.randomUUID(),
			name: input.name ?? "",
			url: input.url,
			secret: newSecret(),
			ownerId: input.ownerId ?? null,
			events: [...new Set(input.events)],
			format: input.format ?? "json",
			enabled: true,
			createdAt: now,
		})
		.returning()
		.get();
}

export function updateWebhook(
	db: Db,
	id: string,
	patch: {
		name?: string;
		url?: string;
		format?: WebhookFormat;
		events?: WebhookEvent[];
		enabled?: boolean;
	},
	ownerId?: string,
): WebhookRow | undefined {
	if (patch.events) assertEventsAllowed(patch.events, ownerId);
	const set = {
		...(patch.name === undefined ? {} : { name: patch.name }),
		...(patch.url === undefined ? {} : { url: patch.url }),
		...(patch.format === undefined ? {} : { format: patch.format }),
		...(patch.events ? { events: [...new Set(patch.events)] } : {}),
		...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
	};
	if (Object.keys(set).length === 0) return getWebhook(db, id, ownerId);
	return db
		.update(webhooks)
		.set(set)
		.where(scope(id, ownerId))
		.returning()
		.get();
}

export function rotateWebhookSecret(
	db: Db,
	id: string,
	ownerId?: string,
): WebhookRow | undefined {
	return db
		.update(webhooks)
		.set({ secret: newSecret() })
		.where(scope(id, ownerId))
		.returning()
		.get();
}

export function deleteWebhook(db: Db, id: string, ownerId?: string): boolean {
	return (
		db
			.delete(webhooks)
			.where(scope(id, ownerId))
			.returning({ id: webhooks.id })
			.all().length > 0
	);
}

/** The account an event belongs to: the one named in it, else the owner of its channel; null = nobody's (staff only). */
function ownerOf(db: Db, data: object): string | null {
	const { accountId, channelId } = data as {
		accountId?: string;
		channelId?: string | null;
	};
	if (accountId) return accountId;
	if (!channelId) return null;
	return (
		db
			.select({ ownerId: channels.ownerId })
			.from(channels)
			.where(eq(channels.id, channelId))
			.get()?.ownerId ?? null
	);
}

// --- delivery ---

export interface NotifierDeps extends GuardDeps {
	db: Db;
	fetch?: typeof fetch;
	now?: () => number;
	/** Backoff between attempts; tests pass a no-op. */
	sleep?: (ms: number) => Promise<unknown>;
}

function sign(secret: string, body: string): string {
	return `sha256=${new Bun.CryptoHasher("sha256", secret).update(body).digest("hex")}`;
}

/** The one line a chat receiver (Discord, Slack, Telegram) shows for an event. */
export function eventText<E extends WebhookEvent>(
	event: E,
	data: WebhookEventData[E],
): string {
	const d = data as Record<string, unknown>;
	switch (event) {
		case "guardrail.blocked":
			return `Pleiades: a message was blocked by guardrails (${d.rule}).`;
		case "run.failed":
			return `Pleiades: a request failed (run ${d.runId}).`;
		case "ip.blocked":
			return `Pleiades: IP ${d.ip} was blocked (${d.reason}).`;
		case "balance.low":
			return `Pleiades: the balance is running low (${Number(d.balanceUsd).toFixed(2)} TR left).`;
		case "balance.depleted":
			return `Pleiades: the balance is used up, ${(d.channels as string[]).length} channels are stopped.`;
		default:
			return "Pleiades: test delivery";
	}
}

/** Delivers events to the webhooks subscribed to them. `emit` never throws and is not awaited by callers. */
export function createNotifier(deps: NotifierDeps) {
	const { db } = deps;
	const doFetch = deps.fetch ?? fetch;
	const now = deps.now ?? Date.now;
	const sleep = deps.sleep ?? Bun.sleep;

	/** One delivery with retries; records the outcome on the webhook row. */
	async function send<E extends WebhookEvent>(
		hook: WebhookRow,
		event: E,
		data: WebhookEventData[E],
	): Promise<DeliveryResult> {
		const text = eventText(event, data);
		const body = JSON.stringify(
			hook.format === "json"
				? { id: crypto.randomUUID(), event, at: now(), data }
				: hook.format === "discord"
					? { content: text }
					: { text },
		);
		// Only our own receivers verify the signature; a chat's incoming webhook ignores extra headers.
		const headers: Record<string, string> = {
			"content-type": "application/json",
			...(hook.format === "json"
				? {
						"x-pleiades-event": event,
						"x-pleiades-signature": sign(hook.secret, body),
					}
				: {}),
		};
		let result: DeliveryResult = { status: null, error: "not sent" };
		for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
			if (attempt > 0) await sleep(500 * 4 ** (attempt - 1));
			try {
				// The dev flag never opens private targets for a customer's webhook.
				const url = await assertPublicUrl(hook.url, {
					...deps,
					allowPrivate: deps.allowPrivate && hook.ownerId === null,
				});
				const response = await doFetch(url, {
					method: "POST",
					headers,
					body,
					redirect: "manual",
					signal: AbortSignal.timeout(TIMEOUT_MS),
				});
				const ok = response.status >= 200 && response.status < 300;
				result = {
					status: response.status,
					error: ok ? null : `HTTP ${response.status}`,
				};
				// 4xx (and a redirect) will not change on a retry.
				if (ok || (response.status < 500 && response.status !== 429)) break;
			} catch (error) {
				result = {
					status: null,
					error: error instanceof Error ? error.message : String(error),
				};
				if (error instanceof UnsafeWebhookUrlError) break;
			}
		}
		try {
			db.update(webhooks)
				.set({
					lastStatus: result.status,
					lastError: result.error,
					lastAt: now(),
				})
				.where(eq(webhooks.id, hook.id))
				.run();
		} catch {
			// the webhook was deleted meanwhile
		}
		return result;
	}

	async function emit<E extends WebhookEvent>(
		event: E,
		data: WebhookEventData[E],
	) {
		try {
			// Staff webhooks (no owner) get every event but the owners' balance; a customer's only their own.
			const owner = ownerOf(db, data);
			const ownerOnly = WEBHOOK_EVENT_SCOPE[event] === "owner";
			const hooks = listWebhooks(db).filter(
				(h) =>
					h.enabled &&
					h.events.includes(event) &&
					(h.ownerId === owner || (h.ownerId === null && !ownerOnly)),
			);
			await Promise.all(hooks.map((hook) => send(hook, event, data)));
		} catch {
			// a notification must never break the request that caused it
		}
	}

	return { emit, send };
}
