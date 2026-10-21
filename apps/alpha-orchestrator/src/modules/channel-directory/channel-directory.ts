import { standingOf } from "../account-billing/account-billing.service.ts";
import type { ChannelRow } from "../channels/channels.types.ts";
import { channels } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import {
	allReplyPrompts,
	DEFAULT_REPLY_PROMPT,
} from "../persona/persona.service.ts";
import type { Standing } from "../standing/standing.service.ts";

/** Everything a request needs to find a channel quickly, built from one read of the table. */
interface ChannelIndex {
	bySlug: Map<string, ChannelRow>;
	byId: Map<string, ChannelRow>;
	byPublishableKey: Map<string, ChannelRow>;
	/** Origins of enabled web channels, for CORS preflights. */
	webOrigins: Set<string>;
	/** Reply system prompt built from each channel's persona (only channels with stored overrides). */
	replyPrompts: Map<string, string>;
}

function buildIndex(
	rows: ChannelRow[],
	replyPrompts: Map<string, string>,
): ChannelIndex {
	const index: ChannelIndex = {
		bySlug: new Map(),
		byId: new Map(),
		byPublishableKey: new Map(),
		webOrigins: new Set(),
		replyPrompts,
	};
	for (const row of rows) {
		index.bySlug.set(row.slug, row);
		index.byId.set(row.id, row);
		if (row.kind !== "web") continue;
		if (row.publishableKey) index.byPublishableKey.set(row.publishableKey, row);
		if (row.disabledAt !== null) continue;
		for (const origin of row.allowedOrigins) index.webOrigins.add(origin);
	}
	return index;
}

/**
 * Channels are looked up on every request, so they are kept in memory as
 * hash maps (O(1) lookups). There is one orchestrator process: admin
 * mutations call `invalidate()` and the next lookup re-reads the table.
 */
export class ChannelDirectory {
	private index: ChannelIndex | null = null;
	/** Owner standing per account, read once and kept until `refreshStanding`. */
	private standings = new Map<string, Standing>();

	constructor(
		private readonly db: Db,
		private readonly now: () => number = Date.now,
	) {}

	private current(): ChannelIndex {
		this.index ??= buildIndex(
			this.db.select().from(channels).all(),
			allReplyPrompts(this.db),
		);
		return this.index;
	}

	bySlug(slug: string): ChannelRow | undefined {
		return this.current().bySlug.get(slug);
	}

	byId(id: string): ChannelRow | undefined {
		return this.current().byId.get(id);
	}

	/** The web channel that owns this publishable key (what the widget sends). */
	byPublishableKey(key: string): ChannelRow | undefined {
		return this.current().byPublishableKey.get(key);
	}

	/**
	 * Whether any enabled web channel lists this origin. Used for CORS
	 * preflights, which carry no widget credentials to pin a channel.
	 */
	isWebOrigin(origin: string): boolean {
		return this.current().webOrigins.has(origin);
	}

	/** The channel's reply system prompt (persona + fixed rules); the standard one for a channel without overrides. */
	replyPrompt(channelId: string): string {
		return this.current().replyPrompts.get(channelId) ?? DEFAULT_REPLY_PROMPT;
	}

	/**
	 * Why this channel's owner may not be served, or `null` when it may. Staff
	 * channels (no owner) never are. A plan that ran `until` a time now past is
	 * `plan_expired` — no timer, the stored `until` is compared with `now`.
	 */
	suspension(channel: Pick<ChannelRow, "ownerId">): {
		reason: "no_plan" | "plan_expired" | "no_balance";
		since: number | null;
	} | null {
		const owner = channel.ownerId;
		if (!owner) return null;
		let standing = this.standings.get(owner);
		if (!standing) {
			standing = standingOf(this.db, owner, this.now());
			this.standings.set(owner, standing);
		}
		if (!standing.ok) return { reason: standing.reason, since: standing.since };
		if (standing.until !== null && standing.until <= this.now())
			return { reason: "plan_expired", since: standing.until };
		return null;
	}

	/** Forget one account's standing: a webhook or a debit changed what it is built from. */
	refreshStanding(accountId: string): void {
		this.standings.delete(accountId);
	}

	invalidate(): void {
		this.index = null;
	}
}
