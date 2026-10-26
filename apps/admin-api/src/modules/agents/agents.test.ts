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

describe("agents and providers (proxied)", () => {
	test("an agent's model is read and picked upstream; provider and model edits reach their routes", async () => {
		const cookie = await signedIn();
		const view = {
			id: "beta-text",
			provider: "openrouter",
			model: "google/gemini-2.5-flash",
			baseUrl: "https://openrouter.ai/api/v1",
			updatedBy: "admin-1",
			updatedAt: 1,
		};
		setRespond(() => json(view));
		expect(
			await (await call("/api/agents/beta-text", { cookie })).json(),
		).toEqual(view);
		const pick = { provider: "openrouter", model: "google/gemini-2.5-flash" };
		await call("/api/agents/beta-text/model", {
			method: "PUT",
			cookie,
			body: pick,
		});
		expect(upstream[1]?.url).toBe(
			"http://orchestrator/v1/admin/agents/beta-text/model",
		);
		expect(upstream[1]?.body).toEqual(pick);

		const model = {
			id: "qwen/qwen3:1.7b",
			name: "Qwen",
			types: ["language"],
			temperature: 0,
			extraBody: {},
		};
		const list = {
			items: [
				{
					id: "openrouter",
					name: "OpenRouter",
					baseUrl: "https://openrouter.ai/api/v1",
					apiKey: "••••1234",
					models: [model],
				},
			],
		};
		setRespond(() => json(list));
		const saved = await call("/api/providers/openrouter/models", {
			method: "PUT",
			cookie,
			body: model,
		});
		expect(await saved.json()).toEqual(list);
		expect(upstream[2]?.body).toEqual(model);
		await call(
			"/api/providers/openrouter/models?fromProvider=openrouter&fromId=qwen%2Fold",
			{ method: "PUT", cookie, body: model },
		);
		expect(upstream[3]?.url).toBe(
			"http://orchestrator/v1/admin/providers/openrouter/models?fromProvider=openrouter&fromId=qwen%2Fold",
		);
		await call(
			`/api/providers/openrouter/models?model=${encodeURIComponent(model.id)}`,
			{
				method: "DELETE",
				cookie,
			},
		);
		expect(upstream[4]?.method).toBe("DELETE");
		expect(upstream[4]?.url).toBe(
			"http://orchestrator/v1/admin/providers/openrouter/models?model=qwen%2Fqwen3%3A1.7b",
		);

		setRespond(() => json({ toml: "x" }));
		await call("/api/providers-toml", {
			method: "PUT",
			cookie,
			body: { toml: "x" },
		});
		expect(upstream[5]?.url).toBe(
			"http://orchestrator/v1/admin/providers-toml",
		);

		const errors = [{ message: "bad", line: 3 }];
		setRespond(() => json({ errors }));
		const checked = await call("/api/providers-toml/check", {
			method: "POST",
			cookie,
			body: { toml: "x" },
		});
		expect(await checked.json()).toEqual({ errors });
		expect(upstream[6]?.method).toBe("POST");
		expect(upstream[6]?.url).toBe(
			"http://orchestrator/v1/admin/providers-toml/check",
		);
		expect(upstream[6]?.body).toEqual({ toml: "x" });
		expect(
			(
				await call("/api/providers-toml/check", {
					method: "POST",
					body: { toml: "x" },
				})
			).status,
		).toBe(401);
	});
});
