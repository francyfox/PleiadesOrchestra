import type {
	AccessChannel,
	AccessVisitor,
	VisitorStatus,
} from "./access.types.ts";

/**
 * The user's own status as shown in the admin panel. Blocking beats
 * whitelisting; a disabled channel is deliberately not reflected here
 * (it is visible on the channel itself).
 */
export function visitorStatus(
	channel: AccessChannel,
	visitor: AccessVisitor,
): VisitorStatus {
	if (visitor.blockedAt !== null) return "blocked";
	if (channel.accessMode === "whitelist" && visitor.whitelistedAt === null) {
		return "pending";
	}
	return "allowed";
}

/** Whether the orchestrator should answer this visitor at all. */
export function isAllowed(
	channel: AccessChannel,
	visitor: AccessVisitor,
): boolean {
	return (
		channel.disabledAt === null && visitorStatus(channel, visitor) === "allowed"
	);
}
