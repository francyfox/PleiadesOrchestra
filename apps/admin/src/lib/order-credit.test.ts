import { expect, test } from "bun:test";
import { orderCredit } from "./order-credit";

const order = { kind: "credits", amount: 1000, currency: "usd" };

test("a stored credit gives the held-back difference", () => {
	const c = orderCredit({ ...order, credited: 7_960_000_000 });
	expect(c?.creditedTr).toBe(7.96);
	expect(c?.heldBackUsd).toBeCloseTo(2.04, 6);
});

test("an old credits order shows the face value only; others show nothing", () => {
	expect(orderCredit({ ...order, credited: null })).toEqual({
		creditedTr: 10,
		heldBackUsd: null,
	});
	expect(orderCredit({ ...order, kind: "plan", credited: null })).toBeNull();
	expect(orderCredit({ ...order, currency: "eur", credited: 1 })).toBeNull();
});
