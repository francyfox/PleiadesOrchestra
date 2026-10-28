import { intentFromToolNameCues, SHOP_TAXONOMY } from "@repo/intent-presets";
import { decideInRounds, planChoiceRounds } from "../choice-rounds";
import type { DecisionAgent } from "../decision-types";
import { withChoiceRound } from "../usage-collector";
import { needsTheWords, type Taxonomy } from "./intent-taxonomy";

export interface ToolOption {
	name: string;
	description?: string;
}

export interface ChooseToolConfig {
	decisionAgent: DecisionAgent;
	tools: ToolOption[];
	/** The channel's merged presets (which tools are only taken from words); the shop's when unset. */
	taxonomy?: Taxonomy;
	/** A winner below this probability is not trusted: the visitor is asked instead. */
	threshold?: number;
}

export type ToolChoice =
	| { kind: "tool"; tool: string; confidence?: number }
	| { kind: "chat" | "unclear"; confidence?: number };

const TOOL_CHOICE_INSTRUCTIONS =
	"Which action of the site does the user ask for? Pick the single closest match; " +
	"pick chat for small talk and other when no action fits.";

const CHAT = "chat";
const NONE = "other";
const DEFAULT_THRESHOLD = 0.5;
const DESCRIPTION_CHARS = 90;
/** Tools per group; `chat` and `other` make it 10, Laya's calibrated size. */
const GROUP_OPTIONS = 8;

/** First sentence, short: Laya shares one 192-token budget between all options of a round. */
function brief(description: string | undefined): string {
	const first = (description ?? "").split(/(?<=[.!?])\s/)[0] ?? "";
	return first.length > DESCRIPTION_CHARS
		? `${first.slice(0, DESCRIPTION_CHARS - 1)}…`
		: first;
}

/**
 * What Laya reads for a tool. The name alone beat name + description: «find
 * sneakers» chose `get_current_product` (description: «the product on the
 * page») over `search_products` with descriptions, and `search products` with
 * the name (6/8 vs 5/8 on the WooCommerce demo). A name of one word says too
 * little, so it keeps the description.
 */
function label(tool: ToolOption): string {
	const words = tool.name
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
	return words.includes(" ") ? words : brief(tool.description);
}

/**
 * The default way to pick what a message asks for, when the channel has no
 * intent set: the site's own tools are the options, in groups of at most 8,
 * each group together with `chat` and `other` (so a group with nothing for the
 * message says so instead of crowning a random tool). The tools that win their
 * group meet in a final round. A knockout that carries one winner through
 * every round (`decideInRounds`) crowned `get_current_product` early and then
 * `list_kits` for «find sneakers»: Laya's probabilities are only relative to
 * the options in the question.
 *
 * Tools that checkout or remove are not offered: those are taken from the
 * visitor's own words only (`NEEDS_THE_WORDS`), never from a model. A winner
 * that is `other`, below the threshold, or not an option at all is `unclear`,
 * so the visitor is asked instead of a random tool being run.
 */
export async function chooseTool(
	config: ChooseToolConfig,
	message: string,
): Promise<ToolChoice> {
	const taxonomy = config.taxonomy ?? SHOP_TAXONOMY;
	const guarded = needsTheWords(taxonomy);
	const offered = config.tools.filter((tool) => {
		const intent = intentFromToolNameCues(taxonomy, tool);
		return !(intent && guarded.has(intent));
	});
	const toolCriteria = Object.fromEntries(
		offered.map((tool) => [tool.name, label(tool)]),
	);
	const framing: Record<string, string> = {
		[CHAT]: "greeting, thanks or small talk, nothing to do with the site",
		[NONE]: "none of the site's actions fits the request",
	};
	const ask = (keys: string[], round: string) =>
		withChoiceRound(round, () =>
			decideInRounds(
				config.decisionAgent,
				{ message },
				{
					questionKey: "tool",
					instructions: TOOL_CHOICE_INSTRUCTIONS,
					criteria: {
						...framing,
						...Object.fromEntries(
							keys.map((key) => [key, toolCriteria[key] ?? ""]),
						),
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
		const { choice, rounds } = await ask(
			group,
			`group ${index + 1} of ${groups.length}`,
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
