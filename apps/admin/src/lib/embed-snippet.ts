export const PLACEHOLDER_SCRIPT_URL = "https://YOUR-HOST/pleiades-widget.js";
export const PLACEHOLDER_AGENT_URL = "https://YOUR-AGENT-HOST";

export const UNPKG_URL =
	"https://unpkg.com/@shalotts/pleiades-widget/dist/pleiades-widget.js";
export const JSDELIVR_URL =
	"https://cdn.jsdelivr.net/npm/@shalotts/pleiades-widget/dist/pleiades-widget.js";

export type EmbedMethod = "cdn-unpkg" | "cdn-jsdelivr" | "npm" | "pnpm" | "bun";

export interface EmbedInput {
	/** Where the site serves `pleiades-widget.js` from. */
	scriptUrl: string;
	/** Public base URL of the orchestrator. */
	agentUrl: string;
	/** The channel's PUBLIC key (pk_…). */
	publishableKey: string;
}

const escapeAttribute = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");

/** The HTML a site owner pastes into their page to show this channel's chat widget. */
export function buildEmbedSnippet({
	scriptUrl,
	agentUrl,
	publishableKey,
}: EmbedInput): string {
	// A secret key in page markup is a leak; never render one, whatever the caller passes.
	if (publishableKey.startsWith("sk_"))
		throw new Error("refusing to embed a secret key");
	const script = escapeAttribute(scriptUrl.trim() || PLACEHOLDER_SCRIPT_URL);
	const agent = escapeAttribute(agentUrl.trim() || PLACEHOLDER_AGENT_URL);
	return [
		`<script src="${script}" defer></script>`,
		"<pleiades-chat",
		`  agent-url="${agent}"`,
		`  publishable-key="${escapeAttribute(publishableKey)}"`,
		"></pleiades-chat>",
	].join("\n");
}

/** Install command for package-manager methods. */
export function buildInstallSnippet(method: EmbedMethod): string {
	switch (method) {
		case "npm":
			return "npm install @shalotts/pleiades-widget";
		case "pnpm":
			return "pnpm add @shalotts/pleiades-widget";
		case "bun":
			return "bun add @shalotts/pleiades-widget";
		default:
			return "";
	}
}

/** HTML/JS snippet depending on the chosen method. */
export function buildEmbedSnippetForMethod(
	method: EmbedMethod,
	input: EmbedInput,
): string {
	if (method === "cdn-unpkg" || method === "cdn-jsdelivr") {
		const url = method === "cdn-unpkg" ? UNPKG_URL : JSDELIVR_URL;
		return buildEmbedSnippet({
			...input,
			scriptUrl: input.scriptUrl || url,
		});
	}
	// package manager: import + element
	if (input.publishableKey.startsWith("sk_"))
		throw new Error("refusing to embed a secret key");
	const agent = (input.agentUrl.trim() || PLACEHOLDER_AGENT_URL).replaceAll(
		'"',
		'\\"',
	);
	const pk = input.publishableKey.replaceAll('"', '\\"');
	return [
		`import "@shalotts/pleiades-widget";`,
		``,
		`document.body.insertAdjacentHTML("beforeend", \``,
		`  <pleiades-chat`,
		`    agent-url="${agent}"`,
		`    publishable-key="${pk}"`,
		`  ></pleiades-chat>`,
		`\`);`,
	].join("\n");
}
