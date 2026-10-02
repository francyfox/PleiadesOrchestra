export interface Verdict {
	ok: boolean;
	/** Why it failed, naming the first difference. */
	reason?: string;
}

type Json = unknown;

const isObject = (value: Json): value is Record<string, Json> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const norm = (value: Json): Json =>
	typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Whether `actual` tool arguments equal `expected`. Strings ignore case and
 * edge spaces; numbers must be numbers; arrays compare in order; no extra and
 * no missing keys — except a key whose value equals the tool's declared default
 * (`defaults`, e.g. `quantity: 1`), which may be given or left out.
 */
export function argsMatch(
	actual: Json,
	expected: Record<string, Json>,
	defaults: Record<string, Json> = {},
): Verdict {
	if (!isObject(actual)) return { ok: false, reason: "not an object" };
	return compare(actual, expected, defaults, "");
}

function compare(
	actual: Json,
	expected: Json,
	defaults: Record<string, Json>,
	path: string,
): Verdict {
	if (isObject(expected)) {
		if (!isObject(actual))
			return { ok: false, reason: `${path || "root"}: not an object` };
		const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
		for (const key of keys) {
			const where = path ? `${path}.${key}` : key;
			const inActual = key in actual;
			const inExpected = key in expected;
			if (inActual && inExpected) {
				const verdict = compare(actual[key], expected[key], defaults, where);
				if (!verdict.ok) return verdict;
			} else if (inActual && norm(actual[key]) === norm(defaults[key])) {
				// A default value that was spelled out.
			} else if (inExpected && norm(expected[key]) === norm(defaults[key])) {
				// A default value that was left out.
			} else {
				return {
					ok: false,
					reason: `${where}: ${inActual ? "unexpected" : "missing"}`,
				};
			}
		}
		return { ok: true };
	}
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual) || actual.length !== expected.length) {
			return { ok: false, reason: `${path}: array differs` };
		}
		for (let i = 0; i < expected.length; i++) {
			const verdict = compare(
				actual[i],
				expected[i],
				defaults,
				`${path}[${i}]`,
			);
			if (!verdict.ok) return verdict;
		}
		return { ok: true };
	}
	return norm(actual) === norm(expected)
		? { ok: true }
		: {
				ok: false,
				reason: `${path}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`,
			};
}

export interface Run {
	ok: boolean;
	/** The model produced parseable arguments at all. */
	valid: boolean;
	latencyMs: number;
}

export interface Summary {
	cases: number;
	accuracy: number;
	valid: number;
	p50Ms: number;
	p90Ms: number;
	meanMs: number;
}

/** Nearest-rank percentile of ascending values. */
function percentile(sorted: number[], p: number): number {
	return sorted[Math.max(Math.ceil((p / 100) * sorted.length) - 1, 0)] ?? 0;
}

export function summarize(runs: Run[]): Summary {
	if (runs.length === 0) {
		return { cases: 0, accuracy: 0, valid: 0, p50Ms: 0, p90Ms: 0, meanMs: 0 };
	}
	const latencies = runs.map((run) => run.latencyMs).sort((a, b) => a - b);
	return {
		cases: runs.length,
		accuracy: runs.filter((run) => run.ok).length / runs.length,
		valid: runs.filter((run) => run.valid).length / runs.length,
		p50Ms: percentile(latencies, 50),
		p90Ms: percentile(latencies, 90),
		meanMs: latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length,
	};
}

/** What a "bring me the ingredients" answer must cover — judged by content, not by exact JSON. */
export interface IngredientsCheck {
	/** Each inner list is one needed ingredient with its acceptable spellings; one hit per group is enough. */
	mustInclude: string[][];
	/** A recipe is a handful of things, not a shopping spree. */
	maxItems: number;
	/** Other top-level fields that must equal these (e.g. `preview: true`). */
	exact?: Record<string, Json>;
}

/**
 * Whether `add_recipe_to_cart`-style arguments cover the recipe: every needed
 * ingredient group appears in some ingredient's name, the list is not
 * inflated, no recipe from the shop's own list is invented, and the fields the
 * case insists on are present.
 */
export function ingredientsMatch(
	actual: Json,
	check: IngredientsCheck,
): Verdict {
	if (!isObject(actual)) return { ok: false, reason: "not an object" };
	const list = actual.ingredients;
	if (!Array.isArray(list) || list.length === 0) {
		return { ok: false, reason: "ingredients: missing" };
	}
	const names = list.map((item) =>
		String(isObject(item) ? (item.name ?? "") : item).toLowerCase(),
	);
	for (const group of check.mustInclude) {
		if (
			!names.some((name) =>
				group.some((alt) => name.includes(alt.toLowerCase())),
			)
		) {
			return { ok: false, reason: `missing ingredient: ${group.join("/")}` };
		}
	}
	if (names.length > check.maxItems) {
		return {
			ok: false,
			reason: `${names.length} ingredients, more than ${check.maxItems}`,
		};
	}
	if (actual.recipe !== undefined) {
		return {
			ok: false,
			reason: `recipe invented: ${JSON.stringify(actual.recipe)}`,
		};
	}
	for (const [key, value] of Object.entries(check.exact ?? {})) {
		if (norm(actual[key]) !== norm(value)) {
			return {
				ok: false,
				reason: `${key}: ${JSON.stringify(actual[key])} ≠ ${JSON.stringify(value)}`,
			};
		}
	}
	return { ok: true };
}
