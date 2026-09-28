import { buildEmbedSnippet } from "$lib/embed-snippet";
import type { CodeLanguage } from "$lib/highlight";

/** The HTML sample of "Getting started": placeholders for every value the reader must replace. */
export const CONNECT_EXAMPLE = buildEmbedSnippet({
	scriptUrl: "",
	agentUrl: "",
	publishableKey: "pk_YOUR_PUBLIC_KEY",
});

/** The site's server linking an anonymous visitor to an account: the one place the SECRET key is used. */
export const IDENTIFY_EXAMPLE = `curl -X POST https://YOUR-AGENT-HOST/v1/channels/CHANNEL_SLUG/identify \\
  -H "Authorization: Bearer sk_YOUR_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"visitorToken":"<from el.getVisitorToken()>","externalUserId":"<your account id>"}'`;

/** Which sample, if any, sits under a question's answer. */
export const FAQ_CODE: Record<string, { code: string; lang: CodeLanguage }> = {
	keys: { code: IDENTIFY_EXAMPLE, lang: "bash" },
};
