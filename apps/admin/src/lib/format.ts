/**
 * Language-neutral rendering of a world-state value in GOAP tables (strings
 * quoted, so "true" and true stay distinguishable). Locale-bound number/date
 * formatting lives in $lib/i18n/format.ts.
 */
export function formatValue(value: unknown): string {
	if (value === undefined) return "—";
	return typeof value === "string" ? JSON.stringify(value) : String(value);
}
