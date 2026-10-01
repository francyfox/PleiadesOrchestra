export interface UsageTotals {
	inputTokens: number;
	outputTokens: number;
	calls: number;
	callsWithoutUsage: number;
}

export const EMPTY_USAGE: UsageTotals = {
	inputTokens: 0,
	outputTokens: 0,
	calls: 0,
	callsWithoutUsage: 0,
};
