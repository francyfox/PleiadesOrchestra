export type Position =
	| "bottom-left"
	| "bottom-right"
	| "top-left"
	| "top-right";

export type ConfigError =
	| "missing_agent_url"
	| "invalid_agent_url"
	| "insecure_agent_url"
	| "missing_key"
	| "secret_key"
	| "invalid_key";

export interface WidgetConfig {
	agentUrl: string;
	publishableKey: string;
}

export type ConfigResult =
	| { ok: true; config: WidgetConfig }
	| { ok: false; error: ConfigError };

const POSITIONS: readonly Position[] = [
	"bottom-left",
	"bottom-right",
	"top-left",
	"top-right",
];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PUBLISHABLE_KEY = /^pk_[A-Za-z0-9_-]{8,}$/;

/** Where the launcher sits; anything unknown falls back to the bottom-left corner. */
export function normalizePosition(value: string | null | undefined): Position {
	const wanted = value?.trim().toLowerCase();
	return POSITIONS.find((position) => position === wanted) ?? "bottom-left";
}

function resolveAgentUrl(
	raw: string | null | undefined,
): { url: string } | { error: ConfigError } {
	const text = raw?.trim();
	if (!text) return { error: "missing_agent_url" };
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return { error: "invalid_agent_url" };
	}
	if (url.protocol !== "https:" && url.protocol !== "http:")
		return { error: "invalid_agent_url" };
	if (url.username || url.password) return { error: "invalid_agent_url" };
	// The visitor token rides on every request: never over clear text, except to a local dev server.
	if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname))
		return { error: "insecure_agent_url" };
	return { url: `${url.origin}${url.pathname}`.replace(/\/+$/, "") };
}

function resolveKey(
	raw: string | null | undefined,
): { key: string } | { error: ConfigError } {
	const key = raw?.trim();
	if (!key) return { error: "missing_key" };
	// Secret keys (sk_…) are for the site's own backend; one in a page is already leaked.
	if (key.startsWith("sk_")) return { error: "secret_key" };
	if (!PUBLISHABLE_KEY.test(key)) return { error: "invalid_key" };
	return { key };
}

export function resolveConfig(input: {
	agentUrl?: string | null;
	publishableKey?: string | null;
}): ConfigResult {
	const url = resolveAgentUrl(input.agentUrl);
	if ("error" in url) return { ok: false, error: url.error };
	const key = resolveKey(input.publishableKey);
	if ("error" in key) return { ok: false, error: key.error };
	return { ok: true, config: { agentUrl: url.url, publishableKey: key.key } };
}

const ADVICE: Record<ConfigError, string> = {
	missing_agent_url:
		"set the agent-url attribute to the https URL of your Pleiades orchestrator.",
	invalid_agent_url:
		"agent-url must be a plain http(s) URL without a username or password.",
	insecure_agent_url:
		"agent-url must use https (plain http is only allowed for localhost).",
	missing_key:
		"set the publishable-key attribute to the channel's PUBLIC key (pk_…).",
	secret_key:
		"publishable-key holds a SECRET key (sk_…). Use the channel's PUBLIC key (pk_…) here; the secret key is for your server only. Treat it as leaked and rotate it in the admin panel.",
	invalid_key:
		"publishable-key must be the channel's PUBLIC key, which starts with pk_.",
};

/** Console text for a developer who misconfigured the element: the code, then what to do. */
export function describeConfigError(code: ConfigError): string {
	return `${code}: ${ADVICE[code]}`;
}

/**
 * Flat customer data the integrating site already knows and the browser
 * can't reliably derive itself (e.g. a delivery city picked from a
 * server-rendered dropdown, not detected via geolocation) — forwarded to
 * the orchestrator as extra facts for the store's own GOAP actions to use.
 * The widget never reads or interprets these values itself.
 */
export type CustomerContext = Record<string, string | number | boolean>;

/**
 * The `examples` attribute: a JSON array of up to three short texts the visitor
 * can click to ask. `undefined` when absent or unusable (the built-in examples
 * stay); `[]` switches them off.
 */
export function parseExamples(
	raw: string | null | undefined,
): string[] | undefined {
	const text = raw?.trim();
	if (!text) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!Array.isArray(parsed)) return undefined;
	const texts = parsed
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean)
		.slice(0, 3);
	return parsed.length === 0 || texts.length > 0 ? texts : undefined;
}

/**
 * Parses the `customer-context` attribute (raw JSON text). Unlike
 * `resolveConfig`'s required fields, a bad value here doesn't block the
 * widget from mounting — it's optional extra context, so this only warns
 * and drops what it can't use, field by field where possible.
 */
export function parseCustomerContext(
	raw: string | null | undefined,
): CustomerContext | undefined {
	const text = raw?.trim();
	if (!text) return undefined;

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		console.error(
			'[pleiades-widget] invalid_customer_context: customer-context must be valid JSON, e.g. {"country":"Kazakhstan","city":"Qyzylorda"}.',
		);
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		console.error(
			"[pleiades-widget] invalid_customer_context: customer-context must be a flat JSON object of strings/numbers/booleans.",
		);
		return undefined;
	}

	const result: CustomerContext = {};
	for (const [key, value] of Object.entries(parsed)) {
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			result[key] = value;
		} else {
			console.error(
				`[pleiades-widget] invalid_customer_context: field "${key}" must be a string, number or boolean — dropped.`,
			);
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
}
