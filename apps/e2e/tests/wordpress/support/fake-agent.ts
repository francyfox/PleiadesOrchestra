import type { Page } from "@playwright/test";

/**
 * Deterministic stand-in for alpha-orchestrator (`/v1/widget/*`), stateful on the
 * Node side so it survives the full page reloads of a classic shop: like the
 * real server it keeps the thread, the run waiting on a browser tool call
 * (`GET .../pending`) and the history. Replies are scripted per prompt, tool
 * arguments may depend on earlier tool results and the "last product" fact.
 * It proves the CLIENT paths (tools run in the page, results come back, reload
 * recovery) — not what the planner/models would pick for a prompt.
 */
export type Step =
	| { tool: string; args: (ctx: Ctx) => Record<string, unknown> }
	| { reply: (ctx: Ctx) => string };

export interface Ctx {
	/** Parsed results of the tools run in this run, in order. */
	results: unknown[];
	/** Session fact like the orchestrator's `lastProduct`: first product of the last search/get_product. */
	lastProduct?: { id: number; name: string; url: string };
}

export type Script = (text: string, ctx: Ctx) => Step[];

interface Hist {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: number;
}

export interface FakeAgent {
	/** Tool results that reached the server: tool name + whether it arrived. */
	toolResults: { tool: string; page?: string }[];
	messages: { text: string; page?: string }[];
	pendingAnswers: string[];
}

const toolText = (result: unknown): unknown => {
	try {
		const r = typeof result === "string" ? JSON.parse(result) : result;
		return JSON.parse((r as { content: { text: string }[] }).content[0].text);
	} catch {
		return result;
	}
};

export async function fakeAgent(
	page: Page,
	script: Script,
	opts: { dropToolResultFor?: string; latencyMs?: number } = {},
): Promise<FakeAgent> {
	const log: FakeAgent = { toolResults: [], messages: [], pendingAnswers: [] };
	const history: Hist[] = [];
	const ctx: Ctx = { results: [] };
	let steps: Step[] = [];
	let waiting: { callId: string; tool: string; arguments: object } | undefined;
	let calls = 0;
	let clock = Date.now();
	const line = (o: object) => JSON.stringify(o);

	// Runs steps until a tool call (stream ends, the run waits) or the final reply.
	const run = (): string[] => {
		const out: string[] = [];
		const next = steps.shift();
		if (!next) return [line({ type: "done" })];
		if ("tool" in next) {
			const args = next.args(ctx);
			waiting = { callId: `call-${++calls}`, tool: next.tool, arguments: args };
			out.push(
				line({
					type: "step",
					id: waiting.callId,
					phase: "running",
					text: next.tool,
				}),
				line({ type: "tool_call", ...waiting }),
			);
			return out;
		}
		const text = next.reply(ctx);
		history.push({
			id: `h${history.length}`,
			role: "assistant",
			content: text,
			createdAt: ++clock,
		});
		return [line({ type: "delta", text }), line({ type: "done" })];
	};

	const ndjson = (lines: string[]) => ({
		status: 200,
		contentType: "application/x-ndjson",
		body: `${lines.join("\n")}\n`,
	});

	await page.route("**/v1/widget/visitors", (r) =>
		r.fulfill({
			status: 201,
			contentType: "application/json",
			body: JSON.stringify({
				visitorToken: "tok",
				expiresAt: Date.now() + 36e5,
			}),
		}),
	);
	await page.route("**/v1/widget/threads", (r) =>
		r.fulfill({
			status: 201,
			contentType: "application/json",
			body: JSON.stringify({ threadId: "thread-fake" }),
		}),
	);
	await page.route("**/v1/widget/tools", (r) => r.fulfill({ status: 204 }));
	await page.route("**/v1/widget/threads/*/messages", (r) =>
		r.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: history }),
		}),
	);
	await page.route("**/v1/widget/threads/*/pending", (r) => {
		const answer = waiting
			? {
					state: "waiting",
					...waiting,
					tasksLeft: steps.length,
				}
			: { state: "none" };
		log.pendingAnswers.push(answer.state + (waiting ? `:${waiting.tool}` : ""));
		return r.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(answer),
		});
	});
	await page.route("**/v1/widget/messages", (r) => {
		const body = r.request().postDataJSON() as { text: string; page?: string };
		log.messages.push({ text: body.text, page: body.page });
		history.push({
			id: `h${history.length}`,
			role: "user",
			content: body.text,
			createdAt: ++clock,
		});
		ctx.results = [];
		steps = script(body.text, ctx);
		return r.fulfill(ndjson(run()));
	});
	await page.route("**/v1/widget/tool-results", async (r) => {
		const body = r.request().postDataJSON() as {
			callId: string;
			tool: string;
			result: unknown;
			page?: string;
			cancelled?: boolean;
		};
		if (opts.dropToolResultFor === body.tool) return r.abort("failed");
		log.toolResults.push({ tool: body.tool, page: body.page });
		if (!waiting || waiting.callId !== body.callId) {
			return r.fulfill(ndjson([line({ type: "done" })]));
		}
		waiting = undefined;
		if (body.cancelled) {
			steps = [];
			return r.fulfill(ndjson([line({ type: "cancelled" })]));
		}
		const data = toolText(body.result);
		ctx.results.push(data);
		const first = Array.isArray(data)
			? data[0]
			: (data as { products?: unknown[] })?.products?.[0];
		const p = first as { id?: number; name?: string; url?: string } | undefined;
		if (p?.id)
			ctx.lastProduct = { id: p.id, name: p.name ?? "", url: p.url ?? "" };
		// Planning the next step takes the real server a model call; an instant answer hides reload races.
		await new Promise((ok) => setTimeout(ok, opts.latencyMs ?? 300));
		return r.fulfill(ndjson(run()));
	});
	return log;
}
