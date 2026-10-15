import { describe, expect, test } from "bun:test";
import {
	classifyMessageIntentDetailed,
	type DecisionAgent,
	type DecisionAnswer,
	type DecisionQuestion,
	type DecisionState,
} from "@repo/core";
import { UntranslatableError, withEnglishOnly } from "./english-only.ts";

const DICTIONARY: Record<string, string> = {
	"Какой магазин ближе?": "Which store is nearer?",
	Алматы: "Almaty",
	Астана: "Astana",
	"Центральный склад": "Central warehouse",
	"купи сыр": "buy cheese",
	"поиск товаров": "product search",
};

function translator() {
	const calls: string[] = [];
	return {
		calls,
		translate: async (text: string) => {
			calls.push(text);
			return DICTIONARY[text] ?? "";
		},
	};
}

/** Records what Laya was sent and answers with whatever `reply` says. */
function recordingAgent(
	reply: (
		questions: Record<string, DecisionQuestion>,
	) => Record<string, DecisionAnswer>,
) {
	const seen: {
		state: DecisionState;
		questions: Record<string, DecisionQuestion>;
	}[] = [];
	const agent: DecisionAgent = {
		decide: async (state, questions) => {
			seen.push({ state, questions });
			return reply(questions);
		},
	};
	return { agent, seen };
}

const choiceQuestion = (
	criteria: Record<string, string | null>,
): DecisionQuestion => ({
	type: "choice",
	instructions: "Какой магазин ближе?",
	criteria,
});

describe("withEnglishOnly", () => {
	test("state values, instructions and criteria descriptions reach Laya in English", async () => {
		const { agent, seen } = recordingAgent(() => ({
			q: { type: "choice", choice: "Almaty" },
		}));
		const { translate } = translator();
		await withEnglishOnly(agent, { translate }).decide(
			{ message: "купи сыр", nested: { tool: "поиск товаров" } },
			{ q: choiceQuestion({ Almaty: "поиск товаров" }) },
		);
		expect(seen[0]?.state).toEqual({
			message: "buy cheese",
			nested: { tool: "product search" },
		});
		const sent = seen[0]?.questions.q as {
			instructions: string;
			criteria: object;
		};
		expect(sent.instructions).toBe("Which store is nearer?");
		expect(sent.criteria).toEqual({ Almaty: "product search" });
	});

	test("non-Latin criteria keys are sent translated and the answer is mapped back with its probabilities", async () => {
		const { agent, seen } = recordingAgent(() => ({
			q: {
				type: "choice",
				choice: "Astana",
				probabilities: { Almaty: 0.2, Astana: 0.8 },
			},
		}));
		const { translate } = translator();
		const answers = await withEnglishOnly(agent, { translate }).decide(
			{ message: "buy cheese" },
			{ q: choiceQuestion({ Алматы: null, Астана: "Центральный склад" }) },
		);
		const sent = seen[0]?.questions.q as { criteria: Record<string, unknown> };
		expect(sent.criteria).toEqual({
			Almaty: null,
			Astana: "Central warehouse",
		});
		expect(answers.q).toEqual({
			type: "choice",
			choice: "Астана",
			probabilities: { Алматы: 0.2, Астана: 0.8 },
		});
	});

	test("two keys that translate alike stay distinct and map back to their own original", async () => {
		const { agent, seen } = recordingAgent((questions) => {
			const keys = Object.keys((questions.q as { criteria: object }).criteria);
			return { q: { type: "choice", choice: keys[1] as string } };
		});
		const translate = async () => "Store";
		const answers = await withEnglishOnly(agent, { translate }).decide(
			{},
			{ q: choiceQuestion({ Алматы: null, Астана: null }) },
		);
		const sent = seen[0]?.questions.q as { criteria: Record<string, unknown> };
		expect(new Set(Object.keys(sent.criteria)).size).toBe(2);
		expect((answers.q as { choice: string }).choice).toBe("Астана");
	});

	test("Latin and neutral text is never translated", async () => {
		const { agent, seen } = recordingAgent(() => ({}));
		const { translate, calls } = translator();
		const question = choiceQuestion({ chat: "hello", "m&m's": null });
		const state = {
			message: "buy 2 Medium Roast Coffee Beans",
			n: 3,
			ok: true,
		};
		await withEnglishOnly(agent, { translate }).decide(state, {
			q: { ...question, instructions: "Pick one" } as DecisionQuestion,
		});
		expect(calls).toEqual([]);
		expect(seen[0]?.state).toEqual(state);
	});

	test("static strings are translated once", async () => {
		const { agent } = recordingAgent(() => ({}));
		const { translate, calls } = translator();
		const english = withEnglishOnly(agent, { translate });
		const q = { q: choiceQuestion({ Алматы: null }) };
		await english.decide({ message: "x" }, q);
		await english.decide({ message: "y" }, q);
		expect(calls.filter((text) => text === "Алматы")).toHaveLength(1);
		expect(
			calls.filter((text) => text === "Какой магазин ближе?"),
		).toHaveLength(1);
	});

	test("a Latin word inside a Russian string stays as typed", async () => {
		const { agent, seen } = recordingAgent(() => ({}));
		const translate = async (text: string) => (text === "купи" ? "buy" : "");
		await withEnglishOnly(agent, { translate }).decide(
			{ message: "купи Medium Roast" },
			{},
		);
		expect(seen[0]?.state).toEqual({ message: "buy Medium Roast" });
	});

	test("an untranslatable string stops the call: no Russian reaches Laya", async () => {
		const { agent, seen } = recordingAgent(() => ({}));
		const empty = withEnglishOnly(agent, { translate: async () => "" });
		await expect(
			empty.decide({ message: "купи сыр" }, {}),
		).rejects.toBeInstanceOf(UntranslatableError);
		const failing = withEnglishOnly(agent, {
			translate: async () => {
				throw new Error("translator down");
			},
		});
		await expect(
			failing.decide({ message: "купи сыр" }, {}),
		).rejects.toBeInstanceOf(UntranslatableError);
		const none = withEnglishOnly(agent, {});
		await expect(
			none.decide({}, { q: choiceQuestion({ Алматы: null }) }),
		).rejects.toBeInstanceOf(UntranslatableError);
		expect(seen).toHaveLength(0);
	});

	test("an English-only call works without any translator", async () => {
		const { agent, seen } = recordingAgent(() => ({}));
		await withEnglishOnly(agent, {}).decide({ message: "hi" }, {});
		expect(seen).toHaveLength(1);
	});
});

describe("message intent without a translation", () => {
	test("falls back to the words/chat instead of asking Laya in Russian", async () => {
		const { agent, seen } = recordingAgent(() => ({}));
		const verdict = await classifyMessageIntentDetailed(
			{ decisionAgent: withEnglishOnly(agent, {}) },
			"расскажи что-нибудь",
		);
		expect(verdict).toEqual({ intent: "chat", source: "fallback" });
		expect(seen).toHaveLength(0);
	});
});
