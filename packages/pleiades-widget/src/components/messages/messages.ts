import Alpine from "@alpinejs/csp";
import type { ChatMessage } from "@/lib/chat/chat.ts";
import { defineComponent } from "../component.ts";
import { createMessagesModel, type MessagesOptions } from "./messages.model.ts";
import { animateConversation } from "./messages.motion.ts";
import { messagesTemplate } from "./messages.template.tsx";

/** The conversation. `render` also moves what Alpine drew (entrances, dots) and keeps the newest message in view. */
export function createMessages(greeting: string, options?: MessagesOptions) {
	const component = defineComponent(
		"messages",
		createMessagesModel(greeting, options),
		messagesTemplate,
	);
	return {
		...component,
		render(messages: readonly ChatMessage[], busy: boolean, root: ParentNode) {
			component.model.render(messages, busy);
			// Alpine updates the DOM on the next microtask; move what it drew after that.
			Alpine.nextTick(() => {
				const list = root.querySelector<HTMLElement>(".messages");
				if (!list) return;
				animateConversation(list);
				list.scrollTop = list.scrollHeight;
			});
		},
	};
}
