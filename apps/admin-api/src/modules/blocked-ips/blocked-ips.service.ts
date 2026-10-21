import { ownerScope } from "../channels/channels.service.ts";
import type { OrchestratorClient } from "../orchestrator/orchestrator.ts";
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

/**
 * Whether `account` may lift block `id`: staff any, a user only a block of their own channel.
 * shortcut: lists the owner's blocks (no get-by-id upstream); add one when a user keeps thousands.
 */
export async function mayDeleteBlock(
	orchestrator: OrchestratorClient,
	account: { id: string; level: number },
	id: string,
): Promise<boolean> {
	const ownerId = ownerScope(account);
	if (!ownerId) return true;
	const { items } = await orchestrator.listBlockedIps({ ownerId });
	return items.some((block) => block.id === id);
}
