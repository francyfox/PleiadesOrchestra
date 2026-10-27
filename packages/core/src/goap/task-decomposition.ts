import {
	intentFromMessageCues,
	type Taxonomy,
	tasksConflict,
} from "@repo/intent-presets";
import type { FunctionCallAgent } from "../function-call-agent";
import type { CallContext } from "../types";
import { needsTheWords } from "./intent-taxonomy";
import { goalForIntent } from "./message-intent";
import type { GoapAction } from "./types";
import type { UnderstoodItem } from "./understanding";

export interface DecomposedTask {
	intent: string;
	/** The words of the message that ask for this task: what the task's own run reads. */
	text?: string;
	/** The products and counts the task is about, when `understandMessage` made the list. */
	items?: UnderstoodItem[];
	/** Index of an earlier task this one must follow. */
	after?: number;
}

/** `intents`: id -> one-line description, e.g. `layaDescriptions(taxonomy)`; the channel decides the words. */
export function decompositionTool(intents: Record<string, string>) {
	return {
		name: "split_message_into_tasks",
		description: [
			"Split the visitor's message into the separate tasks it asks for, in the order said.",
			"intent: what the task does, one of:",
			...Object.entries(intents).map(([id, d]) => `- ${id}: ${d}`),
			"text: the words of the message that ask for this task, copied from it; each task has its own words.",
			"after: index (from 0) of an EARLIER task this one must wait for. Leave it out unless the message says the order (then, after that); the first task never has it.",
			"Examples (after only where the words then / after that / and then / first ... then appear):",
			'"find a lamp and a desk" => [{"intent":"search","text":"find a lamp"},{"intent":"search","text":"a desk"}]',
			'"open my orders, then find a lamp" => [{"intent":"navigate","text":"open my orders"},{"intent":"search","text":"find a lamp","after":0}]',
			"Putting something in the cart is addToCart even when the product is named (select only opens one result); showing what is already in the cart or orders is readState.",
			"A message with one thing to do is one task. Small talk or a question with no action is one task with intent other.",
		].join("\n"),
		inputSchema: {
			type: "object" as const,
			properties: {
				tasks: {
					type: "array",
					minItems: 1,
					items: {
						type: "object",
						properties: {
							intent: { type: "string", enum: Object.keys(intents) },
							text: { type: "string" },
							after: { type: "integer" },
						},
						required: ["intent", "text"],
					},
				},
			},
			required: ["tasks"],
		},
	};
}

/**
 * Asks delta for the task list (repair, validation and corrections come from the
 * agent). `undefined` = unusable answer: the caller keeps today's single-intent path.
 * shortcut: an `after` that is not an earlier index is dropped (delta puts `after: 0` on the first task: strict rejection lost 24/30 answers), so a lost order reads as independent; GOAP must refuse conflicting tasks without `after`.
 */
export async function decomposeMessage(
	agent: FunctionCallAgent,
	intents: Record<string, string>,
	messageEn: string,
	context?: CallContext,
): Promise<DecomposedTask[] | undefined> {
	let answer: Record<string, unknown>;
	try {
		answer = await agent.fillArguments({
			tool: decompositionTool(intents),
			facts: {},
			request: messageEn,
			context,
		});
	} catch {
		return undefined;
	}
	const tasks = answer.tasks as DecomposedTask[] | undefined;
	if (!Array.isArray(tasks) || tasks.length === 0) return undefined;
	for (const [index, task] of tasks.entries()) {
		if (!task || !(task.intent in intents)) return undefined;
		// Several tasks each need their own words: with the whole message a later task would get the first one's arguments.
		if (tasks.length > 1 && !task.text?.trim()) return undefined;
		if (
			task.after !== undefined &&
			!(Number.isInteger(task.after) && task.after >= 0 && task.after < index)
		) {
			delete task.after;
		}
	}
	return tasks;
}

/** Language cues that a message may ask for several things (not product words): a cheap gate before the model call. */
const SEVERAL_CUES = /[,;]|\b(?:and|then|also|plus|after that|afterwards)\b/i;

export const looksLikeSeveralTasks = (english: string): boolean =>
	SEVERAL_CUES.test(english);

/** The message says in which order to do things. Without one, conflicting tasks are not run in a guessed order. */
const ORDER_WORDS =
	/\b(?:then|after that|afterwards|and finally|finally|lastly)\b/i;

export const hasOrderWord = (english: string): boolean =>
	ORDER_WORDS.test(english);

const sameWords = (a?: string, b?: string) =>
	(a ?? "").toLowerCase().replace(/\W+/g, " ").trim() ===
	(b ?? "").toLowerCase().replace(/\W+/g, " ").trim();

/**
 * What of delta's list may run:
 * - an intent that acts on the visitor's own words (checkout, removal) only when the lexical rules confirm it in that task's text (never taken from a model alone);
 * - a task whose intent adds nothing over the base goal (no action of the site gives its effect) is dropped, which also removes a `select` where no tool selects;
 * - a `select` right after a `search` of the same words is the model repeating itself.
 */
export function runnableTasks(
	tasks: DecomposedTask[],
	taxonomy: Taxonomy,
	actions: GoapAction[],
): DecomposedTask[] {
	const guarded = needsTheWords(taxonomy);
	const kept: DecomposedTask[] = [];
	for (const task of tasks) {
		if (
			guarded.has(task.intent) &&
			intentFromMessageCues(taxonomy, task.text ?? "") !== task.intent
		)
			continue;
		if (
			Object.keys(goalForIntent(task.intent, {}, actions, taxonomy)).length ===
			0
		)
			continue;
		const before = kept.at(-1);
		if (
			task.intent === "select" &&
			before?.intent === "search" &&
			sameWords(before.text, task.text)
		)
			continue;
		kept.push(task);
	}
	return kept;
}

/** Several tasks that need an order the message does not give: nothing may run. */
export const mustAskOrder = (
	taxonomy: Taxonomy,
	tasks: DecomposedTask[],
	english: string,
): boolean =>
	tasks.length > 1 &&
	!hasOrderWord(english) &&
	tasksConflict(
		taxonomy,
		tasks.map((task) => task.intent),
	);
