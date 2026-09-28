export const PLACEHOLDER_SCRIPT_URL = "https://YOUR-HOST/pleiades-widget.js";
export const PLACEHOLDER_AGENT_URL = "https://YOUR-AGENT-HOST";

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
