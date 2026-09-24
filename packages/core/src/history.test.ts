import { describe, expect, test } from "bun:test";
import { InMemoryHistoryStore } from "./history";

const ctx = (threadId: string) => ({ threadId, userId: "u1" });

describe("InMemoryHistoryStore", () => {
	test("returns an empty array for an unknown thread", async () => {
		const history = new InMemoryHistoryStore(10);
		expect(await history.get("unknown", 10)).toEqual([]);
	});

	test("appends messages and returns them in order", async () => {
		const history = new InMemoryHistoryStore(10);
		await history.append(ctx("t1"), [{ role: "user", content: "hi" }]);
		await history.append(ctx("t1"), [{ role: "assistant", content: "hello" }]);

		expect(await history.get("t1", 10)).toEqual([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "hello" },
		]);
	});

	test("keeps threads isolated from each other", async () => {
		const history = new InMemoryHistoryStore(10);
		await history.append(ctx("t1"), [{ role: "user", content: "a" }]);
		await history.append(ctx("t2"), [{ role: "user", content: "b" }]);

		expect(await history.get("t1", 10)).toEqual([
			{ role: "user", content: "a" },
		]);
		expect(await history.get("t2", 10)).toEqual([
			{ role: "user", content: "b" },
		]);
	});

	test("caps stored history at maxMessages, dropping the oldest", async () => {
		const history = new InMemoryHistoryStore(2);
		await history.append(ctx("t1"), [
			{ role: "user", content: "1" },
			{ role: "user", content: "2" },
			{ role: "user", content: "3" },
		]);

		expect(await history.get("t1", 10)).toEqual([
			{ role: "user", content: "2" },
			{ role: "user", content: "3" },
		]);
	});

	test("get returns at most `limit` most recent messages", async () => {
		const history = new InMemoryHistoryStore(10);
		await history.append(ctx("t1"), [
			{ role: "user", content: "1" },
			{ role: "user", content: "2" },
			{ role: "user", content: "3" },
		]);

		expect(await history.get("t1", 2)).toEqual([
			{ role: "user", content: "2" },
			{ role: "user", content: "3" },
		]);
	});

	test("reset clears a thread's history", async () => {
		const history = new InMemoryHistoryStore(10);
		await history.append(ctx("t1"), [{ role: "user", content: "hi" }]);
		await history.reset("t1");

		expect(await history.get("t1", 10)).toEqual([]);
	});
});
