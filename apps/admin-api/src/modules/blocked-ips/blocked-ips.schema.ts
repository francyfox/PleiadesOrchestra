import { type Static, t } from "elysia";
import { CreateBlockedIpInput } from "../../forms/forms.ts";
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

export { CreateBlockedIpInput };

export type BlockedIp = Static<typeof BlockedIp>;
