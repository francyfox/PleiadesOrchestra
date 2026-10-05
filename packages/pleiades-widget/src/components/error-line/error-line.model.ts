import type { ChatError } from "@/lib/chat/chat.ts";
import type { Strings } from "@/lib/i18n/i18n.ts";

export function createErrorLineModel(s: Strings) {
	return {
		text: "",
		/**
		 * The chat's error (or none) → its localized text. A request error the site
		 * explained carries its advice after our sentence; the other kinds — above
		 * all a lost connection — never do.
		 */
		render(error: ChatError | undefined, hint?: string) {
			if (!error) this.text = "";
			else if (error === "request" && hint) this.text = `${s.request} ${hint}`;
			else this.text = s[error];
		},
	};
}
