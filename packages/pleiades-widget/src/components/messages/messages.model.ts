import type { ChatMessage } from "@/lib/chat/chat.ts";

/** One conversation bubble as the template draws it. */
export interface BubbleView {
	id: string;
	cls: string;
	content: string;
	/** An assistant bubble with no text yet: the "typing…" dots show. */
	typing: boolean;
	steps: { id: string; cls: string; text: string }[];
}

/** Messages → what the template's `x-for` draws; keyed by id so a streamed reply only rewrites its own bubble. */
export function bubbleViews(messages: readonly ChatMessage[]): BubbleView[] {
	return messages.map((message) => {
		const typing = message.role === "assistant" && message.content === "";
		return {
			id: message.id,
			cls: `message ${message.role === "user" ? "user" : "assistant"}${typing ? " typing" : ""}`,
			content: message.content,
			typing,
			steps: (message.steps ?? []).map((step) => ({
				id: step.id,
				cls: `step ${step.phase}`,
				text: step.text,
			})),
		};
	});
}

export function createMessagesModel(greeting: string) {
	return {
		greeting,
		messages: [] as BubbleView[],
		render(messages: readonly ChatMessage[]) {
			this.messages = bubbleViews(messages);
		},
	};
}

export type MessagesModel = ReturnType<typeof createMessagesModel>;
