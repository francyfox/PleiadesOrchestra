import type { WebMcpToolDescriptor } from "@repo/core";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { channels, mcpCatalogs } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { sha256Hex } from "../security/security.service.ts";
import type { McpSite } from "./mcp.types.ts";

/** Versions of a channel's catalog kept; an older one is dropped when a new one arrives. */
const KEEP_VERSIONS = 5;

/** `JSON.stringify` with object keys in a fixed order, so equal data hashes equally. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
	}
	return JSON.stringify(value);
}

/**
 * Identity of a tool catalog: everything the planner reads (names,
 * descriptions, schemas), independent of tool order and key order. Two panel
 * openings with the same hash have the same classification.
 */
export function hashTools(tools: readonly WebMcpToolDescriptor[]): string {
	const sorted = [...tools].sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	return sha256Hex(canonical(sorted));
}

/**
 * Remembers that a channel's page announced these tools. The same catalog
 * again only bumps `last_seen_at` and `registrations`; a changed one is a new
 * version (the newest {@link KEEP_VERSIONS} are kept).
 */
export function recordCatalog(
	db: Db,
	channelId: string,
	tools: readonly WebMcpToolDescriptor[],
	now: number,
): void {
	if (tools.length === 0) return;
	const hash = hashTools(tools);
	db.$client.transaction(() => {
		db.insert(mcpCatalogs)
			.values({
				channelId,
				hash,
				tools: [...tools],
				toolCount: tools.length,
				firstSeenAt: now,
				lastSeenAt: now,
				registrations: 1,
			})
			.onConflictDoUpdate({
				target: [mcpCatalogs.channelId, mcpCatalogs.hash],
				set: {
					lastSeenAt: now,
					registrations: sql`${mcpCatalogs.registrations} + 1`,
				},
			})
			.run();

		const keep = db
			.select({ hash: mcpCatalogs.hash })
			.from(mcpCatalogs)
			.where(eq(mcpCatalogs.channelId, channelId))
			.orderBy(desc(mcpCatalogs.lastSeenAt), desc(mcpCatalogs.firstSeenAt))
			.limit(KEEP_VERSIONS)
			.all()
			.map((row) => row.hash);
		db.delete(mcpCatalogs)
			.where(
				and(
					eq(mcpCatalogs.channelId, channelId),
					notInArray(mcpCatalogs.hash, keep),
				),
			)
			.run();
	})();
}

/** One entry per channel that has announced tools: its newest catalog, newest-seen channel first. */
export function listMcpSites(db: Db): McpSite[] {
	const rows = db
		.select({
			channelId: mcpCatalogs.channelId,
			channelSlug: channels.slug,
			channelName: channels.name,
			hash: mcpCatalogs.hash,
			tools: mcpCatalogs.tools,
			toolCount: mcpCatalogs.toolCount,
			firstSeenAt: mcpCatalogs.firstSeenAt,
			lastSeenAt: mcpCatalogs.lastSeenAt,
			registrations: mcpCatalogs.registrations,
		})
		.from(mcpCatalogs)
		.innerJoin(channels, eq(channels.id, mcpCatalogs.channelId))
		.orderBy(desc(mcpCatalogs.lastSeenAt), desc(mcpCatalogs.firstSeenAt))
		.all();

	const sites = new Map<string, McpSite>();
	for (const { hash: _hash, ...row } of rows) {
		const existing = sites.get(row.channelId);
		if (existing) {
			existing.versions += 1;
			continue;
		}
		sites.set(row.channelId, { ...row, versions: 1 });
	}
	return [...sites.values()];
}
