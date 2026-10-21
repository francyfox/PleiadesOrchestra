import { ownerScope } from "../channels/channels.service.ts";
import type { OrchestratorClient } from "../orchestrator/orchestrator.ts";

/** A free-text reason, trimmed; blank means "none". */
export function cleanReason(reason: string | undefined): string | undefined {
	return reason?.trim() || undefined;
}

/**
 * Throws the orchestrator's 404 unless `account` may touch the visitor: staff
 * any, a user only one in their own channel.
 * shortcut: reads the whole visitor card; add a lighter upstream check if mutations get hot.
 */
export async function assertVisitorAccess(
	orchestrator: OrchestratorClient,
	account: { id: string; level: number },
	id: string,
): Promise<void> {
	const ownerId = ownerScope(account);
	if (ownerId) await orchestrator.getVisitor(id, ownerId);
}
