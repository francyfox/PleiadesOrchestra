import { type Static, t } from "elysia";
import { nullable } from "../common/common.schema.ts";

export const BlockedIp = t.Object({
	id: t.String(),
	ipHash: t.String(),
	/** Plaintext for the admin view / whois; null on blocks created before it was stored. Matching is by `ipHash`. */
	ip: nullable(t.String()),
	channelId: nullable(t.String()),
	reason: t.String(),
	createdAt: t.Number(),
	expiresAt: t.Number(),
});

export const CreateBlockedIpInput = t.Object({
	ip: t.String(),
	channelId: t.Optional(t.String()),
	reason: t.String(),
	expiresInHours: t.Number(),
});

export type BlockedIp = Static<typeof BlockedIp>;
export type CreateBlockedIpInput = Static<typeof CreateBlockedIpInput>;
