import { t } from "elysia";

export const BlockedIp = t.Object({
	id: t.String(),
	ipHash: t.String(),
	/** Plaintext for the admin view; null on blocks created before it was stored. Matching is by `ipHash`. */
	ip: t.Nullable(t.String()),
	/** Null = the block applies to every channel. */
	channelId: t.Nullable(t.String()),
	reason: t.String(),
	createdAt: t.Number(),
	expiresAt: t.Number(),
});

export const BlockedIpsPage = t.Object({
	items: t.Array(BlockedIp),
	total: t.Number(),
});

export const CreateBlockedIpBody = t.Object({
	ip: t.String({ minLength: 1 }),
	channelId: t.Optional(t.String()),
	reason: t.String({ minLength: 1 }),
	// Mandatory expiry: IPs are shared (NAT, mobile networks).
	expiresInHours: t.Number({ exclusiveMinimum: 0 }),
});

export const BlockedIpResult = t.Object({ item: BlockedIp });
