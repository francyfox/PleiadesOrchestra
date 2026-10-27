import type { UpstreamMcpSites } from "../mcp/mcp.schema.ts";
import type { UpstreamRequestDetails } from "./requests.schema.ts";

type Details = UpstreamRequestDetails;
type Tool = UpstreamMcpSites["items"][number]["tools"][number];
type Facts = Record<string, unknown>;

/**
 * Chrome's Model Context Tool Inspector names every tool `_<tab>_<name>`
 * (`_0_search_products`: the first tab). We keep that so an export can be
 * pasted into the inspector as is.
 */
export const TRACE_TOOL_PREFIX = "_0_";

export const TRACE_MODEL_VERSION = "pleiades-goap";

const record = (value: unknown): Facts =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Facts)
		: {};

interface ToolCall {
	tool: string;
	args: Facts;
}

/** The browser calls one run stopped on (a run pauses on each `webmcp_tool_call`). */
function callsOf(run: Details["runs"][number]): ToolCall[] {
	return run.events.flatMap((event) => {
		if (event.type !== "waiting") return [];
		const waiting = record(event.payload.waiting);
		if (waiting.kind !== "webmcp_tool_call") return [];
		const payload = record(waiting.payload);
		if (typeof payload.tool !== "string") return [];
		return [{ tool: payload.tool, args: record(payload.arguments) }];
	});
}

/** The world state a run started from; the orchestrator writes the browser's answer into it on resume. */
function startState(run: Details["runs"][number] | undefined): Facts {
	const first = run?.events.find((event) => "state" in event.payload);
	return record(first?.payload.state);
}

/** The browser's answer as the MCP result the inspector records (`isError` only when set). */
function mcpResult(state: Facts, tool: string): string {
	const text = state[`webmcp:${tool}:text`];
	const result: Facts = {
		content: [{ type: "text", text: typeof text === "string" ? text : "" }],
	};
	if (state[`webmcp:${tool}:result`] === "error") result.isError = true;
	return JSON.stringify(result);
}

const declaration = (tool: Tool) => ({
	name: `${TRACE_TOOL_PREFIX}${tool.name}`,
	description: tool.description ?? "",
	parametersJsonSchema: tool.inputSchema ?? { type: "object", properties: {} },
});

function usageOf(calls: Details["llmCalls"]) {
	const counted = calls.filter(
		(call) => call.inputTokens !== null || call.outputTokens !== null,
	);
	if (counted.length === 0) return undefined;
	const promptTokenCount = counted.reduce(
		(sum, c) => sum + (c.inputTokens ?? 0),
		0,
	);
	const candidatesTokenCount = counted.reduce(
		(sum, c) => sum + (c.outputTokens ?? 0),
		0,
	);
	return {
		promptTokenCount,
		candidatesTokenCount,
		totalTokenCount: promptTokenCount + candidatesTokenCount,
	};
}

/**
 * The request as Chrome's Model Context Tool Inspector exports a session:
 * `userPrompt` and `response` entries in turn. The prompt opens it, every
 * browser tool call of the GOAP runs is a model `functionCall`, the browser's
 * answer is the next `functionResponse`, the reply closes it with text.
 *
 * Format mirrors beaufortfrancois/model-context-tool-inspector (sidebar.js
 * `promptAI`/`getConfig`): a flat array, `config` on every userPrompt, one
 * following userPrompt per model reply. Our GOAP waits on one browser call at
 * a time, so each functionCall gets its own response turn.
 *
 * Not a Gemini session: there is no single model or system prompt, so
 * `systemInstruction` is left out, `modelVersion` lists the models the request
 * used, and `usageMetadata` is the token sum of the model calls of that run
 * (left out when none reported tokens). The tool answer is the copy the
 * orchestrator kept in the world state, so long answers arrive cut short.
 */
export function buildWebMcpTrace(details: Details, tools: Tool[]): unknown[] {
	const { request, runs, llmCalls } = details;
	// The inspector attaches `config` to every userPrompt. We have no single
	// system prompt, so `systemInstruction` stays empty.
	const config = {
		config: {
			systemInstruction: [] as string[],
			tools:
				tools.length > 0
					? [{ functionDeclarations: tools.map(declaration) }]
					: [],
		},
	};
	const models = [...new Set(llmCalls.map((call) => call.model))];
	const modelVersion = models.length
		? `${TRACE_MODEL_VERSION} (${models.join(", ")})`
		: TRACE_MODEL_VERSION;

	const response = (parts: unknown[], runId: string | null) => {
		const usageMetadata = runId
			? usageOf(llmCalls.filter((call) => call.planRunId === runId))
			: undefined;
		return {
			response: {
				candidates: [
					{
						content: { role: "model", parts },
						finishReason: "STOP",
						index: 0,
					},
				],
				modelVersion,
				...(usageMetadata ? { usageMetadata } : {}),
			},
		};
	};

	const trace: unknown[] = [
		{ userPrompt: { message: request.prompt ?? "", ...config } },
	];
	let id = 0;
	runs.forEach((run, index) => {
		const calls = callsOf(run);
		if (calls.length === 0) return;
		trace.push(
			response(
				calls.map(({ tool, args }) => ({
					functionCall: {
						name: `${TRACE_TOOL_PREFIX}${tool}`,
						args,
						id: `call_${++id}`,
					},
				})),
				run.id,
			),
		);
		const next = runs[index + 1];
		if (!next) return;
		const state = startState(next);
		trace.push({
			userPrompt: {
				message: calls.map(({ tool }) => ({
					functionResponse: {
						name: `${TRACE_TOOL_PREFIX}${tool}`,
						response: { result: mcpResult(state, tool) },
					},
				})),
				...config,
			},
		});
	});
	if (request.reply)
		trace.push(response([{ text: request.reply }], runs.at(-1)?.id ?? null));
	return trace;
}

/**
 * The tools of the catalog the request ran against: of the channel's catalogs, the one that
 * has every tool it called. One channel can serve several sites (the playground), so the
 * channel alone is not enough; with no call to match, its first catalog.
 */
export function catalogOf<T extends { name: string }>(
	details: Details,
	sites: readonly { channelId: string; tools: T[] }[],
): T[] {
	const channel = channelOf(details);
	const own = sites.filter((site) => site.channelId === channel);
	const called = details.runs.flatMap((run) => callsOf(run).map((c) => c.tool));
	const used = own.find((site) =>
		called.every((tool) => site.tools.some((t) => t.name === tool)),
	);
	return (used ?? own[0])?.tools ?? [];
}

/** The channel the request ran for, as the runs recorded it in the world state. */
export function channelOf(details: Details): string | null {
	for (const run of details.runs)
		for (const event of run.events) {
			const channel = record(event.payload.state).channelId;
			if (typeof channel === "string") return channel;
		}
	return null;
}
