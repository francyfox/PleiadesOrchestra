import { describe, expect, test } from "bun:test";
import { decidePending, isReadTool, type Pending } from "./pending.ts";

describe("isReadTool", () => {
	test("a verb that only looks is a read, in any naming style", () => {
		for (const name of [
			"get_cart",
			"listOrders",
			"view-product",
			"search_products",
			"get_order_status",
			"show_wishlist",
		])
			expect(isReadTool(name)).toBe(true);
	});

	test("anything that changes something, or says nothing, is not", () => {
		for (const name of [
			"add_to_cart",
			"update_cart_item",
			"checkout",
			"place_order",
			"clear_cart",
			"get_and_remove_item",
			"submit",
			"",
		])
			expect(isReadTool(name)).toBe(false);
	});
});

const waiting = (tool: string): Pending => ({
	state: "waiting",
	callId: "c1",
	tool,
	arguments: { q: "milk" },
	tasksLeft: 2,
});

describe("decidePending", () => {
	test("a read tool the page has runs by itself", () => {
		expect(decidePending(waiting("get_cart"), true)).toEqual({ do: "run" });
	});

	test("a write tool is never run unasked: the visitor is asked", () => {
		expect(decidePending(waiting("add_to_cart"), true)).toEqual({
			do: "ask",
			tasksLeft: 2,
		});
	});

	test("a read tool this page lacks is asked about too, not run", () => {
		expect(decidePending(waiting("get_cart"), false)).toEqual({
			do: "ask",
			tasksLeft: 2,
		});
	});

	test("an interrupted or expired request offers a retry of its prompt", () => {
		expect(
			decidePending(
				{ state: "interrupted", runId: "r", prompt: "buy milk", tasksLeft: 1 },
				true,
			),
		).toEqual({ do: "retry", prompt: "buy milk", tasksLeft: 1 });
		expect(
			decidePending(
				{ state: "expired", prompt: "buy milk", tasksLeft: 0 },
				true,
			),
		).toEqual({ do: "retry", prompt: "buy milk", tasksLeft: 0 });
	});

	test("nothing pending: nothing to do", () => {
		expect(decidePending({ state: "none" }, true)).toEqual({ do: "nothing" });
	});
});
