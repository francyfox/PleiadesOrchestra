import { describe, expect, test } from "bun:test";
import { ApiError, unwrap } from "./result";

describe("unwrap", () => {
	test("gives back the data of a successful reply", async () => {
		const data = await unwrap(Promise.resolve({ data: { a: 1 }, error: null }));
		expect(data).toEqual({ a: 1 });
	});

	test("throws an ApiError carrying the status and body of a failed reply", async () => {
		const failure = unwrap(
			Promise.resolve({
				data: null,
				error: { status: 503, value: { message: "orchestrator unreachable" } },
			}),
		);
		const error = await failure.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).status).toBe(503);
		expect((error as ApiError).body).toEqual({
			message: "orchestrator unreachable",
		});
		expect((error as ApiError).message).toBe("orchestrator unreachable");
	});

	test("falls back to a generic message when the body has none", async () => {
		const error = await unwrap(
			Promise.resolve({ data: null, error: { status: 500, value: null } }),
		).catch((e: unknown) => e);
		expect((error as ApiError).message).toBe("Request failed (500)");
	});
});
