import type { ChatError } from "@/lib/chat/chat.ts";
import type { Strings } from "@/lib/i18n/i18n.ts";

export function createErrorLineModel(s: Strings) {
	return {
		text: "",
		/** The chat's error (or none) → its localized text. */
		render(error: ChatError | undefined) {
			this.text = error ? s[error] : "";
		},
	};
}
