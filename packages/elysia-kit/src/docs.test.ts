import { expect, test } from "bun:test";
import { Elysia } from "elysia";
import { docs } from "./docs.ts";

test("the Scalar page loads the spec by an absolute path, so a nested docs path works", async () => {
	const app = new Elysia()
		.use(docs({ title: "t", path: "/api/docs" }))
		.get("/api/ping", () => "pong");
	const page = await (
		await app.handle(new Request("http://localhost/api/docs"))
	).text();
	expect(page).toContain("@scalar/api-reference");
	// The plugin HTML-escapes the attribute (&quot;), the browser decodes it back.
	const attribute = page.match(/data-configuration='([^']*)'/)?.[1] ?? "";
	expect(JSON.parse(attribute.replaceAll("&quot;", '"')).url).toBe(
		"/api/docs/json",
	);
	const spec = await app.handle(new Request("http://localhost/api/docs/json"));
	expect(spec.status).toBe(200);
});
