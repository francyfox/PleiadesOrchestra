import { expect, test } from "bun:test";
import {
	collectTokens,
	reportTokens,
	withChoiceReport,
	withChoiceRound,
} from "./usage-collector";

test("calls inside add up, concurrent collectors stay apart, none reported stays undefined", async () => {
	const a = collectTokens(async () => {
		reportTokens({ inputTokens: 5, outputTokens: 0 });
		await Bun.sleep(5);
		reportTokens({ inputTokens: 7 });
	});
	const b = collectTokens(async () => {
		await Bun.sleep(2);
		reportTokens({ inputTokens: 100 });
	});
	const none = collectTokens(async () => reportTokens({}));
	expect((await a).tokens).toEqual({ inputTokens: 12, outputTokens: 0 });
	expect((await b).tokens).toEqual({ inputTokens: 100 });
	expect((await none).tokens).toEqual({});
	expect(() => reportTokens({ inputTokens: 1 })).not.toThrow();
});

test("withChoiceReport hands every choice answer, with all probabilities, to the surrounding collector", async () => {
	const agent = withChoiceReport({
		async decide() {
			return {
				intent: {
					type: "choice",
					choice: "chat",
					probabilities: { chat: 0.7, other: 0.3 },
				},
				ok: { type: "boolean", probability: 0.9 },
			};
		},
	});
	const { tokens } = await collectTokens(async () => {
		await agent.decide({}, {});
		await agent.decide({}, {});
	});
	expect(tokens.choices).toEqual([
		{
			question: "intent",
			chosen: "chat",
			options: { chat: 0.7, other: 0.3 },
			state: {},
		},
		{
			question: "intent",
			chosen: "chat",
			options: { chat: 0.7, other: 0.3 },
			state: {},
		},
	]);
	await expect(agent.decide({}, {})).resolves.toBeDefined();
});

test("withChoiceReport keeps what was asked: the state, the instructions and each option's criterion", async () => {
	const agent = withChoiceReport({
		async decide() {
			return {
				tool: { type: "choice", choice: "add_to_cart", probabilities: {} },
			};
		},
	});
	const { tokens } = await collectTokens(() =>
		agent.decide(
			{ message: "buy toilet paper" },
			{
				tool: {
					type: "choice",
					instructions: "Which action?",
					criteria: { add_to_cart: "add to cart" },
				},
			},
		),
	);
	expect(tokens.choices?.[0]).toMatchObject({
		state: { message: "buy toilet paper" },
		instructions: "Which action?",
		criteria: { add_to_cart: "add to cart" },
	});
	expect(tokens.choices?.[0]).not.toHaveProperty("round");
});

test("withChoiceRound labels the choices answered inside it", async () => {
	const agent = withChoiceReport({
		async decide() {
			return { tool: { type: "choice", choice: "a", probabilities: {} } };
		},
	});
	const question = {
		tool: { type: "choice" as const, instructions: "?", criteria: { a: "a" } },
	};
	const { tokens } = await collectTokens(() =>
		withChoiceRound("final", () => agent.decide({}, question)),
	);
	expect(tokens.choices?.[0]?.round).toBe("final");
});
