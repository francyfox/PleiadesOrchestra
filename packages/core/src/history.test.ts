import { describe, expect, test } from "bun:test";
import { ThreadHistory } from "./history";

describe("ThreadHistory", () => {
	test("returns an empty array for an unknown thread", () => {
		const history = new ThreadHistory(10);
		expect(history.get("unknown")).toEqual([]);
	});

	test("appends messages and returns them in order", () => {
		const history = new ThreadHistory(10);
		history.append("t1", { role: "user", content: "hi" });
		history.append("t1", { role: "assistant", content: "hello" });

		expect(history.get("t1")).toEqual([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "hello" },
		]);
	});

	test("keeps threads isolated from each other", () => {
		const history = new ThreadHistory(10);
		history.append("t1", { role: "user", content: "a" });
		history.append("t2", { role: "user", content: "b" });

		expect(history.get("t1")).toEqual([{ role: "user", content: "a" }]);
		expect(history.get("t2")).toEqual([{ role: "user", content: "b" }]);
	});

	test("caps history at maxMessages, dropping the oldest", () => {
		const history = new ThreadHistory(2);
		history.append("t1", { role: "user", content: "1" });
		history.append("t1", { role: "user", content: "2" });
		history.append("t1", { role: "user", content: "3" });

		expect(history.get("t1")).toEqual([
			{ role: "user", content: "2" },
			{ role: "user", content: "3" },
		]);
	});

	test("reset clears a thread's history", () => {
		const history = new ThreadHistory(10);
		history.append("t1", { role: "user", content: "hi" });
		history.reset("t1");

		expect(history.get("t1")).toEqual([]);
	});
});
