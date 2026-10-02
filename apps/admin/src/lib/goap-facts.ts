type Facts = Record<string, string | number | boolean>;

/** `key=value, key=value` — a goal or a set of effects on one line. */
export function formatGoal(facts: Facts): string {
	const entries = Object.entries(facts);
	if (entries.length === 0) return "goal";
	return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}
