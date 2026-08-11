export interface UsageInfo {
	elapsedMs: number;
	inputTokens?: number;
	outputTokens?: number;
}

/** One-line summary of a `done` event's usage, e.g. "42.1 tok/s · 657/2048 tokens · 32% context · 1.1s". */
export function formatUsageSummary(
	usage: UsageInfo,
	contextWindowTokens?: number,
): string {
	const parts: string[] = [];

	if (usage.outputTokens !== undefined && usage.elapsedMs > 0) {
		const tokensPerSecond = usage.outputTokens / (usage.elapsedMs / 1000);
		parts.push(`${tokensPerSecond.toFixed(1)} tok/s`);
	}

	if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
		const totalTokens = usage.inputTokens + usage.outputTokens;
		if (contextWindowTokens) {
			const percent = Math.round((totalTokens / contextWindowTokens) * 100);
			parts.push(
				`${totalTokens}/${contextWindowTokens} tokens`,
				`${percent}% context`,
			);
		} else {
			parts.push(`${totalTokens} tokens`);
		}
	}

	parts.push(`${(usage.elapsedMs / 1000).toFixed(1)}s`);

	return parts.join(" · ");
}
