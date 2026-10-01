import { describe, expect, test } from "bun:test";
import {
	call,
	setRespond,
	signedIn,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

describe("orchestrator failures", () => {
	test("orchestrator failures map to 404 / 502 / 503 with a message", async () => {
		const cookie = await signedIn();

		setRespond(
			() => new Response("", { status: 404, statusText: "Not Found" }),
		);
		const notFound = await call("/api/users/nope", { cookie });
		expect(notFound.status).toBe(404);
		expect(await notFound.json()).toMatchObject({
			message: expect.stringContaining("404"),
		});

		setRespond(() => new Response("", { status: 500 }));
		expect((await call("/api/users/u1", { cookie })).status).toBe(502);

		setRespond(() => {
			throw new Error("ECONNREFUSED");
		});
		const down = await call("/api/users/u1", { cookie });
		expect(down.status).toBe(503);
	});
});
