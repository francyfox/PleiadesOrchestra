import { intentFromToolNameCues, SHOP_TAXONOMY } from "@repo/intent-presets";
import { decideInRounds, planChoiceRounds } from "#core/choice-rounds";
import type { DecisionAgent } from "#core/decision-types";
import {
	effectsOf,
	needsTheWords,
	type Taxonomy,
} from "#core/goap/intent-taxonomy";
import { withChoiceRound } from "#core/usage-collector";

export interface ToolOption {
	name: string;
	description?: string;
	/** The tool action's effects: which intent it serves (`ChooseToolConfig.intent`). */
	effects?: Record<string, unknown>;
	/** Its enum parameters (`GoapAction.options`): what the site offers. */
	options?: Record<string, string[]>;
}

export interface ChooseToolConfig {
	decisionAgent: DecisionAgent;
	tools: ToolOption[];
	/** The channel's merged presets (which tools are only taken from words); the shop's when unset. */
	taxonomy?: Taxonomy;
	/** A winner below this probability is not trusted: the visitor is asked instead. */
	threshold?: number;
	/**
	 * What the visitor's words already say the message does («buy» = addToCart):
	 * only the tools with that intent's effects are offered, so the products
	 * named cannot pull in another tool; when no tool has them, every tool is.
	 */
	intent?: string;
}

export type ToolChoice =
	/** `via: "words"`: the intent left one tool, no model was asked. */
	| { kind: "tool"; tool: string; confidence?: number; via?: "words" }
	| { kind: "chat" | "unclear"; confidence?: number };

const TOOL_CHOICE_INSTRUCTIONS =
	"Which action of the site does the user ask for? Pick the single closest match; " +
	"pick chat for small talk and other when no action fits.";

const CHAT = "chat";
const NONE = "other";
const DEFAULT_THRESHOLD = 0.5;
const DESCRIPTION_CHARS = 90;
/** The last round has few options, so it can afford most of a description. */
const FINAL_DESCRIPTION_CHARS = 200;
/** Tools per group; `chat` and `other` make it 10, Laya's calibrated size. */
const GROUP_OPTIONS = 8;

/** First sentence, short: Laya shares one 192-token budget between all options of a round. */
function brief(description: string | undefined): string {
	return cut(
		(description ?? "").split(/(?<=[.!?])\s/)[0] ?? "",
		DESCRIPTION_CHARS,
	);
}

const cut = (text: string, chars: number): string =>
	text.length > chars ? `${text.slice(0, chars - 1)}…` : text;

const nameWords = (name: string): string =>
	name
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

/**
 * What the model reads for a tool in a group. The name alone beat name +
 * description on Laya: «find sneakers» chose `get_current_product`
 * (description: «the product on the page») over `search_products` with
 * descriptions (6/8 vs 5/8 on the WooCommerce demo). A name of one word says
 * too little, so it keeps the description.
 */
function label(tool: ToolOption): string {
	const words = nameWords(tool.name);
	return words.includes(" ") ? words : brief(tool.description);
}

/**
 * What the model reads in the last round: name and description. Names alone
 * crowned `add_staples_to_cart` for «buy toilet paper» (the products read as
 * staples); its description says it is for «the usual».
 */
function explained(tool: ToolOption): string {
	return tool.description
		? `${nameWords(tool.name)}: ${cut(tool.description, FINAL_DESCRIPTION_CHARS)}`
		: label(tool);
}

export async function chooseTool(
	config: ChooseToolConfig,
	message: string,
): Promise<ToolChoice> {
	const taxonomy = config.taxonomy ?? SHOP_TAXONOMY;
	const guarded = needsTheWords(taxonomy);
	const safe = config.tools.filter((tool) => {
		const intent = intentFromToolNameCues(taxonomy, tool);
		return !(intent && guarded.has(intent));
	});
	const intentEffects = config.intent
		? Object.entries(effectsOf(config.intent, taxonomy))
		: [];
	const ofIntent =
		intentEffects.length > 0
			? safe.filter((tool) =>
					intentEffects.every(([key, value]) => tool.effects?.[key] === value),
				)
			: [];
	const only = ofIntent.length === 1 ? ofIntent[0] : undefined;
	if (only) return { kind: "tool", tool: only.name, via: "words" };
	const offered = ofIntent.length > 0 ? ofIntent : safe;
	const toolCriteria = Object.fromEntries(
		offered.map((tool) => [tool.name, label(tool)]),
	);
	const toolExplained = Object.fromEntries(
		offered.map((tool) => [tool.name, explained(tool)]),
	);
	const framing: Record<string, string> = {
		[CHAT]: "greeting, thanks or small talk, nothing to do with the site",
		[NONE]: "none of the site's actions fits the request",
	};
	const ask = (keys: string[], round: string, texts: Record<string, string>) =>
		withChoiceRound(round, () =>
			decideInRounds(
				config.decisionAgent,
				{ message },
				{
					questionKey: "tool",
					instructions: TOOL_CHOICE_INSTRUCTIONS,
					criteria: {
						...framing,
						...Object.fromEntries(keys.map((key) => [key, texts[key] ?? ""])),
					},
				},
			),
		);

	const groups = planChoiceRounds({
		instructions: TOOL_CHOICE_INSTRUCTIONS,
		criteria: { ...framing, ...toolCriteria },
		maxOptions: GROUP_OPTIONS,
	}).map((round) => round.filter((key) => key in toolCriteria));
	const winners: { tool: string; probability?: number }[] = [];
	let chat: number | undefined;
	for (const [index, group] of groups.entries()) {
		// A single group is also the last round.
		const { choice, rounds } = await ask(
			group,
			`group ${index + 1} of ${groups.length}`,
			groups.length === 1 ? toolExplained : toolCriteria,
		);
		const probability = rounds[rounds.length - 1]?.probability;
		if (choice === CHAT) chat = Math.max(chat ?? 0, probability ?? 1);
		else if (choice && choice in toolCriteria) {
			winners.push({ tool: choice, probability });
		}
	}

	let final = winners[0];
	if (winners.length > 1) {
		const { choice, rounds } = await ask(
			winners.map((w) => w.tool),
			"final",
			toolExplained,
		);
		const probability = rounds[rounds.length - 1]?.probability;
		final =
			choice && choice in toolCriteria
				? { tool: choice, probability }
				: undefined;
	}
	if (!final) {
		return chat !== undefined
			? { kind: "chat", confidence: chat }
			: { kind: "unclear" };
	}
	const trusted =
		final.probability === undefined ||
		final.probability >= (config.threshold ?? DEFAULT_THRESHOLD);
	return trusted
		? { kind: "tool", tool: final.tool, confidence: final.probability }
		: { kind: "unclear", confidence: final.probability };
}

const ASKS_INSTRUCTIONS =
	"Does the user only ask which choices there are (for example which sizes, styles or times exist), " +
	"rather than ask to do something? A request worded as a question («can you make it large?») is asking to do it.";

/**
 * The tool's options when the message only asks what they are («what sizes are
 * there?»): the reply lists them from the schema and the site is not called.
 * Asked (one boolean decision) only for a tool that changes something and has
 * fixed options; a search or a reader is called for a question as usual («do
 * you have tomatoes?», «what is in my cart?»).
 */
export async function askedOptions(
	config: { decisionAgent: DecisionAgent; taxonomy?: Taxonomy },
	tool: ToolOption,
	message: string,
): Promise<Record<string, string[]> | undefined> {
	if (!tool.options || Object.keys(tool.options).length === 0) return undefined;
	const taxonomy = config.taxonomy ?? SHOP_TAXONOMY;
	const reads = ["search", "readState"].some((intent) =>
		Object.entries(effectsOf(intent, taxonomy)).every(
			([key, value]) => tool.effects?.[key] === value,
		),
	);
	if (reads) return undefined;
	const answers = await config.decisionAgent.decide(
		{ message },
		{ asks: { type: "boolean", instructions: ASKS_INSTRUCTIONS } },
	);
	const answer = answers.asks;
	return answer?.type === "boolean" && answer.probability >= DEFAULT_THRESHOLD
		? tool.options
		: undefined;
}
