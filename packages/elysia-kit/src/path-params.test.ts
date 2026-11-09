import { expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { decodeSlashParams } from "./path-params.ts";

type Handles = { handle(request: Request): Response | Promise<Response> };

const idOf = async (app: Handles, path: string, method = "GET") =>
	await (
		await app.handle(new Request(`http://localhost${path}`, { method }))
	).text();

const app = () =>
	new Elysia()
		.use(decodeSlashParams())
		.get("/x/:id", ({ params }) => params.id)
		.post("/y/:id/reset", ({ params }) => params.id)
		.get("/typed/:id", ({ params }) => params.id, {
			params: t.Object({ id: t.String({ pattern: "^[a-z]+/[a-z]+$" }) }),
		})
		.group("/g", (g) => g.get("/:model", ({ params }) => params.model));

test("an encoded slash reaches the handler as a slash, in any casing", async () => {
	expect(await idOf(app(), "/x/a%2Fb")).toBe("a/b");
	expect(await idOf(app(), "/x/a%2fb")).toBe("a/b");
	expect(await idOf(app(), "/y/telegram%2F1/reset", "POST")).toBe("telegram/1");
	expect(await idOf(app(), "/g/anthropic%2Fclaude")).toBe("anthropic/claude");
});

test("other escapes keep the framework's own decoding", async () => {
	expect(await idOf(app(), "/x/a%20b")).toBe("a b");
	expect(await idOf(app(), "/x/a%3Ab")).toBe("a:b");
	expect(await idOf(app(), "/x/%D0%BF")).toBe("п");
});

test("the schema sees the decoded value", async () => {
	expect(await idOf(app(), "/typed/openai%2Fgpt")).toBe("openai/gpt");
});
