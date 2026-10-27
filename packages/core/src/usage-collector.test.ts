import { expect, test } from "bun:test";
import {
	collectTokens,
	reportTokens,
	withChoiceReport,
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
		{ question: "intent", chosen: "chat", options: { chat: 0.7, other: 0.3 } },
		{ question: "intent", chosen: "chat", options: { chat: 0.7, other: 0.3 } },
	]);
	await expect(agent.decide({}, {})).resolves.toBeDefined();
});
