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

/**
 * Messages → what the template's `x-for` draws; keyed by id so a streamed reply
 * only rewrites its own bubble. The typing dots show only on the newest bubble
 * and only while a reply is being made (`busy`): a bubble left with flow lines
 * and no text (a task that failed) is finished, not still typing.
 */
export function bubbleViews(
	messages: readonly ChatMessage[],
	busy: boolean,
): BubbleView[] {
	return messages.map((message, index) => {
		const typing =
			busy &&
			index === messages.length - 1 &&
			message.role === "assistant" &&
			message.content === "";
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
		render(messages: readonly ChatMessage[], busy: boolean) {
			this.messages = bubbleViews(messages, busy);
		},
	};
}

export type MessagesModel = ReturnType<typeof createMessagesModel>;
