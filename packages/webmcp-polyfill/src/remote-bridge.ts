import { fromWireError } from "./tool-error.ts";
import type {
	AnyWindow,
	NormalizedTool,
	PolyfillDeps,
	SerializableTool,
} from "./types.ts";

const TOOLS_TIMEOUT_MS = 500;

interface ReplyMatch {
	/** The window the request went to; replies from any other source are dropped. */
	from: Window;
	/** Verifies `event.origin` — never trusts anything in the payload. */
	originOk: (origin: string) => boolean;
	type: string;
	requestId: string;
}

/** True only for a reply of the expected type from the expected window AND origin. */
export function isExpectedReply(event: MessageEvent, m: ReplyMatch): boolean {
	const { data, source, origin } = event;
	return (
		source === m.from &&
		m.originOk(origin) &&
		data?.type === m.type &&
		data.requestId === m.requestId
	);
}

/** Resolves with the first matching message, or null after `timeoutMs`. */
function awaitReply(
	win: AnyWindow,
	match: ReplyMatch,
	timeoutMs?: number,
): Promise<MessageEvent | null> {
	return new Promise((resolve) => {
		const stop = () => win.removeEventListener("message", listener);
		const timer =
			timeoutMs === undefined
				? undefined
				: setTimeout(() => {
						stop();
						resolve(null);
					}, timeoutMs);
		const listener = (event: Event) => {
			if (!isExpectedReply(event as MessageEvent, match)) return;
			clearTimeout(timer);
			stop();
			resolve(event as MessageEvent);
		};
		win.addEventListener("message", listener);
	});
}

/** Pins each tool's `origin` to the verified `event.origin`, never the payload. */
function toRemoteTools(event: MessageEvent, w: Window): NormalizedTool[] {
	const tools = (event.data.tools as SerializableTool[]) ?? [];
	return tools.map((t) => ({
		...t,
		origin: event.origin,
		window: w as AnyWindow,
		_isRemote: true,
	}));
}

/** Requesting side of the cross-window bridge. */
export function createRemoteBridge({ win, newId }: PolyfillDeps) {
	/**
	 * Asks window `w` for its tools. The request goes only to `trustedOrigins`
	 * (never "*"), and only a response from one of them is accepted.
	 */
	const getTools = async (
		w: Window,
		trustedOrigins: ReadonlySet<string>,
	): Promise<NormalizedTool[]> => {
		if (trustedOrigins.size === 0) return [];
		const requestId = newId();
		const reply = awaitReply(
			win,
			{
				from: w,
				originOk: (o) => trustedOrigins.has(o),
				type: "WEBMCP_GET_TOOLS_RESPONSE",
				requestId,
			},
			TOOLS_TIMEOUT_MS,
		);
		for (const target of trustedOrigins)
			w.postMessage({ type: "WEBMCP_GET_TOOLS_REQUEST", requestId }, target);
		const event = await reply;
		return event ? toRemoteTools(event, w) : [];
	};

	/** Runs a remote tool; `tool.origin` was pinned by `getTools`. */
	const execute = async (
		tool: NormalizedTool,
		w: Window,
		inputObject: unknown,
	): Promise<unknown> => {
		const requestId = newId();
		const targetOrigin = tool.origin;
		const reply = awaitReply(win, {
			from: w,
			originOk: (o) => o === targetOrigin,
			type: "WEBMCP_EXECUTE_TOOL_RESPONSE",
			requestId,
		});
		w.postMessage(
			{
				type: "WEBMCP_EXECUTE_TOOL_REQUEST",
				requestId,
				name: tool.name,
				inputObject,
			},
			targetOrigin,
		);
		const { data } = (await reply) as MessageEvent;
		if (data.success) return data.result;
		throw fromWireError(data);
	};

	return { getTools, execute };
}
