import { describe, expect, test } from "bun:test";
import {
	call,
	SNAPSHOT,
	signedIn,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

describe("system", () => {
	test("system returns the host snapshot", async () => {
		const cookie = await signedIn();
		expect(await (await call("/api/system", { cookie })).json()).toEqual(
			SNAPSHOT,
		);
	});
});
