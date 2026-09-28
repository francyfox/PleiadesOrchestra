import { describe, expect, test } from "bun:test";
import { copyText } from "./clipboard";

describe("copyText", () => {
	test("writes through the async clipboard API and reports success", async () => {
		const written: string[] = [];
		const ok = await copyText("pk_abc", {
			writeText: async (text) => {
				written.push(text);
			},
		});
		expect(ok).toBe(true);
		expect(written).toEqual(["pk_abc"]);
	});

	test("reports failure instead of throwing when the browser refuses", async () => {
		const ok = await copyText("pk_abc", {
			writeText: async () => {
				throw new DOMException("denied", "NotAllowedError");
			},
		});
		expect(ok).toBe(false);
	});

	test("reports failure when there is no clipboard at all (insecure context)", async () => {
		expect(await copyText("pk_abc", undefined)).toBe(false);
	});
});
