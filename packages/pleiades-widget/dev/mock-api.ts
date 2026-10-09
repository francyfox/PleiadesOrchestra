import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

/**
 * Dev-only stand-in for the public Widget API (docs/admin-api.md), served by
 * the Vite dev server itself (same origin, so no CORS). Used when the dev page
 * has no real `agent-url`. Say a keyword in the chat to pick a scenario:
 *   "steps" — flow lines, then a reply   · "error" — a failed task (`task_failed`)
 *   "fail"  — a server fault             · "slow"  — a long, token-by-token reply
 *   "tool"  — a WebMCP `tool_call` (needs a browser-side tool; resumes via tool-results)
 *   anything else — a short echo.
 */
interface Item {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: number;
	steps?: { id: string; phase: "done"; text: string }[];
}

const threads = new Map<string, Item[]>();
let counter = 0;
const nextId = (prefix: string) => `${prefix}_${++counter}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const readJson = async (req: IncomingMessage) => {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	try {
		return JSON.parse(Buffer.concat(chunks).toString() || "{}");
	} catch {
		return {};
	}
};

const json = (res: ServerResponse, body: unknown, status = 200) => {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
};

async function ndjson(
	res: ServerResponse,
	lines: AsyncGenerator<unknown> | unknown[],
) {
	res.writeHead(200, { "content-type": "application/x-ndjson" });
	for await (const line of lines) {
		res.write(`${JSON.stringify(line)}\n`);
		await sleep(40);
	}
	res.end();
}

async function* reply(thread: string, text: string): AsyncGenerator<unknown> {
	const items = threads.get(thread) ?? [];
	const lower = text.toLowerCase();
	const steps: NonNullable<Item["steps"]> = [];
	let answer = `Mock reply to: «${text}»`;

	if (lower.includes("fail")) {
		yield { type: "error", message: "mock server fault" };
		return;
	}
	if (lower.includes("error")) {
		yield {
			type: "error",
			message: "task failed",
			code: "task_failed",
			hint: "The shop has no such product. Try another query.",
		};
		return;
	}
	if (lower.includes("steps")) {
		for (const [id, label] of [
			["search", "Searching the catalog…"],
			["cart", "Adding to the cart…"],
		] as const) {
			yield { type: "step", id, phase: "running", text: label };
			await sleep(500);
			yield { type: "step", id, phase: "done", text: label.replace("…", " ✓") };
			steps.push({ id, phase: "done", text: label.replace("…", " ✓") });
		}
		answer = "Done: the item is in your cart.";
	}
	if (lower.includes("slow")) {
		answer = "This is a long mock reply that arrives word by word. ".repeat(6);
	}

	items.push({
		id: nextId("msg"),
		role: "user",
		content: text,
		createdAt: Date.now(),
	});
	for (const word of answer.split(/(?<= )/)) {
		yield { type: "delta", text: word };
		await sleep(lower.includes("slow") ? 80 : 15);
	}
	items.push({
		id: nextId("msg"),
		role: "assistant",
		content: answer,
		createdAt: Date.now(),
		...(steps.length ? { steps } : {}),
	});
	threads.set(thread, items);
	yield { type: "done", elapsedMs: 123, inputTokens: 42, outputTokens: 17 };
}

export function mockWidgetApi(): Plugin {
	return {
		name: "pleiades-mock-widget-api",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const url = new URL(req.url ?? "/", "http://localhost");
				if (!url.pathname.startsWith("/v1/widget/")) return next();
				const route = `${req.method} ${url.pathname}`;

				if (route === "POST /v1/widget/visitors")
					return json(res, {
						visitorToken: nextId("vt"),
						expiresAt: Date.now() + 24 * 3600_000,
					});
				if (route === "POST /v1/widget/threads") {
					const threadId = nextId("thread");
					threads.set(threadId, []);
					return json(res, { threadId });
				}
				if (route === "POST /v1/widget/tools") {
					await readJson(req);
					return json(res, { ok: true });
				}
				const history = url.pathname.match(
					/^\/v1\/widget\/threads\/([^/]+)\/messages$/,
				);
				if (req.method === "GET" && history)
					return json(res, {
						items: threads.get(decodeURIComponent(history[1] ?? "")) ?? [],
					});
				if (route === "POST /v1/widget/messages") {
					const body = await readJson(req);
					const text = String(body.text ?? "");
					if (text.toLowerCase().includes("tool"))
						return ndjson(res, [
							{
								type: "tool_call",
								tool: "search_products",
								arguments: { query: "cheese" },
								callId: nextId("call"),
							},
						]);
					return ndjson(res, reply(String(body.threadId), text));
				}
				if (route === "POST /v1/widget/tool-results") {
					const body = await readJson(req);
					return ndjson(
						res,
						reply(String(body.threadId), "tool result received"),
					);
				}
				return json(res, { message: "mock: unknown route" }, 404);
			});
		},
	};
}
