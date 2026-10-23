import { describe, expect, test } from "bun:test";
import { type IntentPreset, mergePresets } from "@repo/intent-presets";
import type { DecisionAgent } from "../decision-types";
import {
	classifyMessageIntentDetailed,
	goalForIntent,
	messageIntentCriteria,
} from "./message-intent";
import { chooseTool } from "./tool-choice";
import { createWebMcpActions } from "./webmcp-actions";

// A preset that has nothing to do with shops: table booking.
const bookings: IntentPreset = {
	id: "bookings",
	sessionFacts: ["venue"],
	intents: {
		reserve: {
			description: "book a table",
			preconditions: { venueChosen: true },
			effects: { booked: true },
		},
		cancel: {
			description: "cancel a booking",
			preconditions: {},
			effects: { booked: false },
			needsWords: true,
		},
		other: { description: "anything else", preconditions: {}, effects: {} },
	},
	messageCues: (m) => (/\bcancel\b/i.test(m) ? "cancel" : undefined),
	toolCues: (t) => (t.name.startsWith("reserve") ? "reserve" : undefined),
};
const taxonomy = mergePresets([bookings]);

/** A decision agent that answers with `pick` and keeps the options it was asked. */
function agent(pick: string) {
	const asked: string[][] = [];
	const decisionAgent: DecisionAgent = {
		async decide(_state, questions) {
			const [key, question] = Object.entries(questions)[0] as [
				string,
				{ criteria: Record<string, string> },
			];
			asked.push(Object.keys(question.criteria));
			return {
				[key]: { type: "choice", choice: pick, probabilities: { [pick]: 0.9 } },
			};
		},
	};
	return { decisionAgent, asked };
}

describe("a preset other than the shop", () => {
	test("Laya is offered its intents, not the shop's, and words guard its own dangerous one", async () => {
		expect(Object.keys(messageIntentCriteria(taxonomy))).toEqual([
			"chat",
			"reserve",
			"other",
		]);

		const { decisionAgent, asked } = agent("reserve");
		expect(
			await classifyMessageIntentDetailed(
				{ decisionAgent, taxonomy, rules: "guarded" },
				"a table for two tomorrow",
			),
		).toMatchObject({ intent: "reserve", source: "laya" });
		expect(asked[0]).not.toContain("addToCart");

		// `cancel` comes from the words only, never from a model.
		expect(
			await classifyMessageIntentDetailed(
				{
					decisionAgent: agent("reserve").decisionAgent,
					taxonomy,
					rules: "guarded",
				},
				"please cancel my booking",
			),
		).toMatchObject({ intent: "cancel", source: "words" });
		expect(
			await classifyMessageIntentDetailed(
				{
					decisionAgent: agent("cancel").decisionAgent,
					taxonomy,
					rules: "guarded",
				},
				"hmm",
			),
		).toMatchObject({ intent: "chat" });
	});

	test("an answer that belongs to another preset is no answer", async () => {
		expect(
			await classifyMessageIntentDetailed(
				{ decisionAgent: agent("addToCart").decisionAgent, taxonomy },
				"hmm",
			),
		).toMatchObject({ intent: "chat" });
	});

	test("the goal asks for the facts its intent gives, when some action can give them", () => {
		const reserveTool = {
			name: "reserve_table",
			cost: 1,
			preconditions: {},
			effects: { booked: true },
			execute: async () => ({}),
		};
		expect(
			goalForIntent("reserve", { replied: true }, [reserveTool], taxonomy),
		).toEqual({
			replied: true,
			booked: true,
		});
		expect(goalForIntent("reserve", { replied: true }, [], taxonomy)).toEqual({
			replied: true,
		});
	});

	test("a tool is classified by the preset's name cue and gets the preset's preconditions and effects", async () => {
		const [action] = await createWebMcpActions({
			tools: [{ name: "reserve_table", description: "Book a table" }],
			decisionAgent: agent("other").decisionAgent,
			taxonomy,
		});
		expect(action).toMatchObject({
			name: "reserve_table",
			preconditions: { venueChosen: true },
			effects: { booked: true, "toolResult:reserve_table": true },
		});
	});

	test("the tool choice never offers the preset's guarded tool", async () => {
		const { decisionAgent, asked } = agent("reserve_table");
		const tools = [
			{ name: "reserve_table", description: "Book a table" },
			{ name: "cancel_booking", description: "Cancel it" },
		];
		// `cancel_booking` has no cue of this preset, so it is offered; a cue makes it guarded.
		const guarded = mergePresets([
			{
				...bookings,
				toolCues: (t) => (t.name.startsWith("cancel") ? "cancel" : "reserve"),
			},
		]);
		await chooseTool({ decisionAgent, tools, taxonomy: guarded }, "a table");
		expect(asked.flat()).not.toContain("cancel_booking");
		expect(asked.flat()).toContain("reserve_table");
	});
});
