import { h } from "src/components/jsx.ts";
import type { ChatMessage, ChatStep } from "src/lib/chat/chat.ts";

interface Bubble {
	el: HTMLElement;
	/** The flow lines (what the assistant is doing), above the text. */
	flow: HTMLElement;
	text: Text;
	/** What `flow` currently shows, to rewrite it only when it changed. */
	flowKey: string;
}

const stepKey = (steps: readonly ChatStep[]) =>
	steps.map((step) => `${step.id}\0${step.phase}\0${step.text}`).join("\n");

/**
 * The scrolling conversation. `render` is incremental: bubbles are keyed by
 * message id, so a streamed reply only rewrites the text of its own bubble.
 * Replies and flow lines are always set as text, never as HTML.
 */
export function MessageList({ greeting }: { greeting: string }) {
	const el = (
		<div class="messages" part="messages" role="log" aria-live="polite">
			<p class="message assistant">{greeting}</p>
		</div>
	) as HTMLDivElement;
	const bubbles = new Map<string, Bubble>();

	function createBubble(message: ChatMessage): Bubble {
		const flow = (<span class="flow" />) as HTMLElement;
		const text = document.createTextNode("");
		const bubbleEl = (
			<p class={`message ${message.role === "user" ? "user" : "assistant"}`} />
		) as HTMLElement;
		bubbleEl.append(flow, text);
		el.appendChild(bubbleEl);
		return { el: bubbleEl, flow, text, flowKey: "" };
	}

	return {
		el,
		render(messages: readonly ChatMessage[]) {
			const alive = new Set(messages.map((message) => message.id));
			for (const [id, bubble] of bubbles) {
				if (!alive.has(id)) {
					bubble.el.remove();
					bubbles.delete(id);
				}
			}
			for (const message of messages) {
				let bubble = bubbles.get(message.id);
				if (!bubble) {
					bubble = createBubble(message);
					bubbles.set(message.id, bubble);
				}
				if (bubble.text.data !== message.content) {
					bubble.text.data = message.content;
				}
				const steps = message.steps ?? [];
				const key = stepKey(steps);
				if (key !== bubble.flowKey) {
					bubble.flowKey = key;
					bubble.flow.replaceChildren(
						...steps.map(
							(step: any) =>
								(
									<span class={`step ${step.phase}`}>{step.text}</span>
								) as HTMLElement,
						),
					);
				}
				// An assistant bubble with no text yet is the "typing…" indicator.
				bubble.el.classList.toggle("typing", message.content === "");
			}
			el.scrollTop = el.scrollHeight;
		},
	};
}
