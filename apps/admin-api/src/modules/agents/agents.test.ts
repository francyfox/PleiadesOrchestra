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

describe("agents settings (proxied)", () => {
	test("settings are read and patched upstream with the admin id, keys are written to the key route", async () => {
		const cookie = await signedIn();
		const view = {
			id: "beta-text",
			editable: true,
			overrides: {
				source: null,
				baseUrl: null,
				model: "m",
				providerKey: null,
				parameters: {},
			},
			defaults: {
				baseUrl: "http://beta-text:8080/v1",
				model: "vikhr",
				temperature: null,
				reasoningEffort: null,
			},
			effective: {
				source: "local",
				baseUrl: "http://beta-text:8080/v1",
				model: "m",
				provider: null,
				temperature: null,
				reasoningEffort: null,
				extraBody: {},
			},
			updatedBy: "admin-1",
			updatedAt: 1,
		};
		setRespond(() => json(view));
		const read = await call("/api/agents/beta-text", { cookie });
		expect(await read.json()).toEqual(view);
		expect(upstream[0]?.url).toBe(
			"http://orchestrator/v1/admin/agents/beta-text",
		);

		const saved = await call("/api/agents/beta-text", {
			method: "PATCH",
			cookie,
			body: { model: "m", baseUrl: null },
		});
		expect(saved.status).toBe(200);
		expect(upstream[1]?.method).toBe("PATCH");
		expect(upstream[1]?.body).toEqual({ model: "m", baseUrl: null });

		setRespond(() =>
			json({
				name: "openrouter",
				mask: "••••1234",
				updatedBy: "a",
				updatedAt: 1,
			}),
		);
		await call("/api/provider-keys/openrouter", {
			method: "PUT",
			cookie,
			body: { key: "sk-1234" },
		});
		expect(upstream[2]?.url).toBe(
			"http://orchestrator/v1/admin/provider-keys/openrouter",
		);
		expect(upstream[2]?.body).toEqual({ key: "sk-1234" });
	});
});
