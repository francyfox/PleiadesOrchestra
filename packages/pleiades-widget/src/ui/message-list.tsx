import type { ChatMessage } from "../lib/chat";
import { h } from "./jsx";

/**
 * The scrolling conversation. `render` is incremental: bubbles are keyed by
 * message id, so a streamed reply only rewrites the text of its own bubble.
 * Replies are always set as text, never as HTML.
 */
export function MessageList({ greeting }: { greeting: string }) {
	const el = (
		<div class="messages" part="messages" role="log" aria-live="polite">
			<p class="message assistant">{greeting}</p>
		</div>
	) as HTMLDivElement;
	const bubbles = new Map<string, HTMLElement>();

	return {
		el,
		render(messages: readonly ChatMessage[]) {
			const alive = new Set(messages.map((message) => message.id));
			for (const [id, bubble] of bubbles) {
				if (!alive.has(id)) {
					bubble.remove();
					bubbles.delete(id);
				}
			}
			for (const message of messages) {
				let bubble = bubbles.get(message.id);
				if (!bubble) {
					bubble = (
						<p
							class={`message ${message.role === "user" ? "user" : "assistant"}`}
						/>
					) as HTMLElement;
					bubbles.set(message.id, bubble);
					el.appendChild(bubble);
				}
				if (bubble.textContent !== message.content)
					bubble.textContent = message.content;
				// An assistant bubble with no text yet is the "typing…" indicator.
				bubble.classList.toggle("typing", message.content === "");
			}
			el.scrollTop = el.scrollHeight;
		},
	};
}
