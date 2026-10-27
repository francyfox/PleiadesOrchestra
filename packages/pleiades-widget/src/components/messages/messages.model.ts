import type { ChatMessage } from "@/lib/chat/chat.ts";
import type { Lang, Strings } from "@/lib/i18n/i18n.ts";
import { parseReply } from "./reply.model.ts";
import { stampLabel, stampTitle } from "./stamp.model.ts";

/** What the answered message is cut to before it goes to the server (the contract's limit). */
export const REPLY_TO_MAX = 2000;

/** One conversation bubble as the template draws it. */
export interface BubbleView {
	id: string;
	cls: string;
	content: string;
	/** An assistant bubble with no text yet: the "typing…" dots show. */
	typing: boolean;
	steps: { id: string; cls: string; text: string }[];
	/** The text as text and link runs (links are `http(s)` only); a user bubble is one text run. */
	parts: PartView[];
	/** Options of the newest reply once it is finished: buttons. */
	choices: OptionView[];
	/** Options of an older reply: plain lines, so the conversation still reads. */
	listed: OptionView[];
	/** What a picked option answered (one line; the stylesheet ellipsizes it). */
	quote: string;
	/** Relative time («5 min»), its ISO form and the exact local time for the hover title; empty when the message has no time. */
	time: string;
	iso: string;
	title: string;
}

export interface PartView {
	key: string;
	text: string;
	href: string;
	isLink: boolean;
	isText: boolean;
}

export interface OptionView {
	key: string;
	/** Its position in the list, `"1"`..`"9"`: the key that picks it. */
	n: string;
	text: string;
	label: string;
}

/** The message text without its options list, on one line: what a picked option quotes. */
const quoteOf = (replyTo: string) =>
	parseReply(replyTo)
		.parts.map((part) => part.text)
		.join("")
		.replace(/\s+/g, " ")
		.trim();

/** How times are written: the widget's language and clock. */
interface Clock {
	lang: Lang;
	justNow: string;
	now: number;
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
	clock?: Clock,
	optionLabel = "{n}: {text}",
): BubbleView[] {
	return messages.map((message, index) => {
		const reply =
			message.role === "assistant"
				? parseReply(message.content)
				: { parts: [], options: [] as string[] };
		const options = reply.options.map((text, i) => ({
			key: `${message.id}:${i}`,
			n: String(i + 1),
			text,
			label: optionLabel.replace("{n}", String(i + 1)).replace("{text}", text),
		}));
		const newest = index === messages.length - 1;
		const parts = (
			message.role === "assistant"
				? reply.parts
				: [{ kind: "text" as const, text: message.content }]
		).map((part, i) => ({
			key: `${message.id}:${i}`,
			text: part.text,
			href: part.kind === "link" ? part.href : "",
			isLink: part.kind === "link",
			isText: part.kind === "text",
		}));
		const typing =
			busy &&
			index === messages.length - 1 &&
			message.role === "assistant" &&
			message.content === "";
		const at = message.createdAt;
		const stamped = clock && at !== undefined && !typing;
		return {
			time: stamped ? stampLabel(at, clock.now, clock.lang, clock.justNow) : "",
			iso: stamped ? new Date(at).toISOString() : "",
			title: stamped ? stampTitle(at, clock.lang) : "",
			id: message.id,
			cls: `message ${message.role === "user" ? "user" : "assistant"}${typing ? " typing" : ""}`,
			content: message.content,
			parts,
			choices: newest && !busy ? options : [],
			listed: newest ? [] : options,
			quote: message.replyTo ? quoteOf(message.replyTo) : "",
			typing,
			steps: (message.steps ?? []).map((step) => ({
				id: step.id,
				cls: `step ${step.phase}`,
				text: step.text,
			})),
		};
	});
}

export interface MessagesOptions {
	s?: Strings;
	/** For message times; English if not given. */
	lang?: Lang;
	now?: () => number;
	/** Things to try, shown until the visitor has written something. */
	examples?: readonly string[];
	/** An example was clicked: ask it. */
	onAsk?: (text: string) => void;
	/** An option was picked: send its text, answering `replyTo` (the full text of the reply it came from). */
	onPick?: (text: string, replyTo: string) => void;
}

/** Where the keyboard is when a key is pressed: only then do 1..9 pick an option. */
export interface PickContext {
	open: boolean;
	/** The focus is inside the panel. */
	inPanel: boolean;
	draftEmpty: boolean;
}

export function createMessagesModel(
	greeting: string,
	{
		s,
		lang = "en",
		now = Date.now,
		examples = [],
		onAsk,
		onPick,
	}: MessagesOptions = {},
) {
	let last: { messages: readonly ChatMessage[]; busy: boolean } = {
		messages: [],
		busy: false,
	};
	/** The newest reply's options while they can be picked. */
	let picks: { options: string[]; replyTo: string } | undefined;
	const choose = (index: number) => {
		const text = picks?.options[index];
		if (picks && text) onPick?.(text, picks.replyTo);
	};
	return {
		s,
		greeting,
		examples: [...examples],
		hasUserMessage: false,
		messages: [] as BubbleView[],
		get showExamples() {
			return this.examples.length > 0 && !this.hasUserMessage;
		},
		render(messages: readonly ChatMessage[], busy: boolean) {
			last = { messages, busy };
			this.hasUserMessage = messages.some((m) => m.role === "user");
			this.messages = bubbleViews(
				messages,
				busy,
				{
					lang,
					justNow: s?.justNow ?? "just now",
					now: now(),
				},
				s?.option,
			);
			const tail = messages[messages.length - 1];
			picks =
				tail?.role === "assistant" && !busy
					? {
							options: parseReply(tail.content).options,
							replyTo: tail.content.slice(0, REPLY_TO_MAX),
						}
					: undefined;
		},
		/** The clock moved on (the shared minute timer): redraw the relative times. */
		refresh() {
			this.render(last.messages, last.busy);
		},
		/** A click on an option button (`data-n` is its number). */
		pick(event: Event) {
			choose(Number((event.currentTarget as HTMLElement).dataset.n) - 1);
		},
		/**
		 * Keys 1..9 pick an option of the newest finished reply — only with the
		 * focus in the open panel, an empty composer and no modifier. True = the
		 * key was used (the caller keeps it out of the composer).
		 */
		pickKey(
			event: Pick<
				KeyboardEvent,
				"key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing"
			>,
			where: PickContext,
		): boolean {
			if (!/^[1-9]$/.test(event.key) || event.isComposing) return false;
			if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
				return false;
			const index = Number(event.key) - 1;
			if (!where.open || !where.inPanel || !where.draftEmpty) return false;
			if (!picks?.options[index]) return false;
			choose(index);
			return true;
		},
		/** A click on an example: its text rides on the button (`data-example`). */
		ask(event: Event) {
			const text = (event.currentTarget as HTMLElement).dataset.example;
			if (text) onAsk?.(text);
		},
	};
}

export type MessagesModel = ReturnType<typeof createMessagesModel>;
