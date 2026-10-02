import { describe, expect, test } from "bun:test";
import { customerFacts, replyChunks } from "./goap.service.ts";

describe("customerFacts", () => {
	test("prefixes every key so it can't collide with bookkeeping facts", () => {
		expect(customerFacts({ city: "Almaty", vip: true, floor: 3 })).toEqual({
			"customer:city": "Almaty",
			"customer:vip": true,
			"customer:floor": 3,
		});
	});

	test("no context means no facts", () => {
		expect(customerFacts(undefined)).toEqual({});
	});
});

describe("replyChunks", () => {
	test("a plain message is split into chunks as before", () => {
		expect(replyChunks({ userMessage: "привет" }, 100)).toEqual(["привет"]);
	});

	test("after an item went into the cart the reply is told what was done", () => {
		const [chunk] = replyChunks(
			{
				userMessage: "купи 1 сыр",
				inCart: true,
				product: "Swiss Cheese",
				quantity: 1,
				store: "Penny Pantry",
			},
			1000,
		);
		expect(chunk).toContain("купи 1 сыр");
		expect(chunk).toContain("1 × Swiss Cheese");
		expect(chunk).toContain("Penny Pantry");
	});
});
