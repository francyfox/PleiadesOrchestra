import type { ChannelRow } from "../channels/channels.types.ts";
import { channels } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";

/** Everything a request needs to find a channel quickly, built from one read of the table. */
interface ChannelIndex {
	bySlug: Map<string, ChannelRow>;
	byId: Map<string, ChannelRow>;
	byPublishableKey: Map<string, ChannelRow>;
	/** Origins of enabled web channels, for CORS preflights. */
	webOrigins: Set<string>;
}

function buildIndex(rows: ChannelRow[]): ChannelIndex {
	const index: ChannelIndex = {
		bySlug: new Map(),
		byId: new Map(),
		byPublishableKey: new Map(),
		webOrigins: new Set(),
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

	constructor(private readonly db: Db) {}

	private current(): ChannelIndex {
		this.index ??= buildIndex(this.db.select().from(channels).all());
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

	invalidate(): void {
		this.index = null;
	}
}
