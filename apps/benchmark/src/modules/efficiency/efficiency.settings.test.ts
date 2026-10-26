import { expect, test } from "bun:test";
import { createOrchestraSettings } from "./efficiency.settings.ts";

function fakeServer(models: Record<string, unknown>[]) {
	const puts: { path: string; body: Record<string, unknown> }[] = [];
	const agents: Record<string, { provider: string; model: string }> = {
		"beta-text": { provider: "p", model: "a" },
		"delta-function-call": { provider: "p", model: "a" },
	};
	const fetch = (async (url: string, init?: RequestInit) => {
		const path = new URL(url).pathname;
		if (init?.method === "PUT") {
			const body = JSON.parse(String(init.body));
			puts.push({ path, body });
			const at = models.findIndex((model) => model.id === body.id);
			models[at] = body;
			return Response.json(body);
		}
		if (path === "/v1/admin/agents")
			return Response.json({
				items: [
					{ id: "beta-text", model: "a" },
					{ id: "delta-function-call", model: "a" },
					{ id: "gamma-decision", model: "g" },
					{ id: "translate", model: "t" },
				],
			});
		const agent = agents[path.split("/").pop() ?? ""];
		if (agent) return Response.json(agent);
		if (path === "/v1/admin/providers")
			return Response.json({ items: [{ id: "p", models }] });
		return new Response(null, { status: 404 });
	}) as typeof globalThis.fetch;
	return { fetch, puts };
}

test("sets temperature 0 once per model and restores the exact original body", async () => {
	const original = {
		id: "a",
		name: "A",
		types: ["language"],
		temperature: 0.3,
		extraBody: { x: 1 },
	};
	const { fetch, puts } = fakeServer([
		{ ...original },
		{ id: "g", name: "G", types: ["decision"], extraBody: {} },
	]);
	const settings = createOrchestraSettings({
		baseUrl: "http://o",
		adminApiKey: "k",
		fetch,
	});
	const restore = await settings.freeze();
	expect(puts).toEqual([
		{
			path: "/v1/admin/providers/p/models",
			body: { ...original, temperature: 0 },
		},
	]);
	const during = await settings.agents();
	expect(during.map((one) => [one.agent, one.model, one.temperature])).toEqual([
		["beta-text", "a", 0],
		["delta-function-call", "a", 0],
		["gamma-decision", "g", undefined],
		["translate", "t", undefined],
	]);
	await restore();
	expect(puts.at(-1)?.body).toEqual(original);
	expect(puts).toHaveLength(2);
});
