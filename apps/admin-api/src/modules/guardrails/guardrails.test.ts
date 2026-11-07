import { describe, expect, test } from "bun:test";
import {
	call,
	json,
	setRespond,
	signedIn,
	upstream,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

describe("guardrails (proxied)", () => {
	const view = { enabled: false, rules: "foo", defaults: "bar" };

	test("read and saved upstream", async () => {
		const cookie = await signedIn();
		setRespond(() => json(view));
		expect(await (await call("/api/guardrails", { cookie })).json()).toEqual(
			view,
		);
		const saved = await call("/api/guardrails", {
			method: "PUT",
			cookie,
			body: { enabled: true, rules: "foo" },
		});
		expect(saved.status).toBe(200);
		const put = upstream.at(-1);
		expect(put?.url).toBe("http://orchestrator/v1/admin/guardrails");
		expect(put?.body).toEqual({ enabled: true, rules: "foo" });
	});

	test("the orchestrator's per-line errors reach the page as a 422", async () => {
		const cookie = await signedIn();
		const errors = [{ line: 2, message: "Invalid regular expression" }];
		setRespond(() => json({ errors }, 422));
		const res = await call("/api/guardrails", {
			method: "PUT",
			cookie,
			body: { enabled: true, rules: "ok\n(" },
		});
		expect(res.status).toBe(422);
		expect(await res.json()).toEqual({ errors });
	});

	test("without a session: 401", async () => {
		expect((await call("/api/guardrails")).status).toBe(401);
	});
});
