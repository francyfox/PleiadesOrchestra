/**
 * History lives only in the messages table, so keeping fewer messages per
 * user than the agent reads per thread would silently shrink the model's
 * context. Checked once at startup.
 */
export function assertRetentionCoversHistory(
	retentionPerUser: number,
	agentHistoryMessages: number,
): void {
	if (retentionPerUser < agentHistoryMessages) {
		throw new Error(
			`MESSAGE_RETENTION_PER_USER (${retentionPerUser}) must be ≥ the agent's history window (${agentHistoryMessages})`,
		);
	}
}
