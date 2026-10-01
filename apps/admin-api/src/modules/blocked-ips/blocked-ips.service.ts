import type { CreateBlockedIpInput } from "./blocked-ips.schema.ts";

/** The block to send upstream (trimmed, empty channel dropped), or `null` if the input is unusable. */
export function cleanBlockedIp(
	input: CreateBlockedIpInput,
): CreateBlockedIpInput | null {
	const ip = input.ip.trim();
	const reason = input.reason.trim();
	if (
		!ip ||
		!reason ||
		!Number.isFinite(input.expiresInHours) ||
		input.expiresInHours <= 0
	) {
		return null;
	}
	return {
		ip,
		reason,
		expiresInHours: input.expiresInHours,
		channelId: input.channelId || undefined,
	};
}
