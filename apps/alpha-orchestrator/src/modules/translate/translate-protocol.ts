import { TextTooLongError, type Translate } from "./translate.service.ts";

/** Main thread → worker. `init` is posted once, right after the worker starts. */
export type ToWorker =
	| { type: "init"; init: unknown }
	| { type: "translate"; id: number; text: string };

/** An error as it crosses the thread boundary (class instances don't survive `postMessage`). */
export interface WireError {
	name: string;
	message: string;
	/** Set for a `TextTooLongError`. */
	limit?: number;
}

/** Worker → main thread. */
export type FromWorker =
	| { type: "ready" }
	| { type: "init-failed"; error: WireError }
	| { type: "result"; id: number; text: string }
	| { type: "failed"; id: number; error: WireError };

export function toWire(error: unknown): WireError {
	if (error instanceof TextTooLongError) {
		return {
			name: "TextTooLongError",
			message: error.message,
			limit: error.limit,
		};
	}
	if (error instanceof Error)
		return { name: error.name, message: error.message };
	return { name: "Error", message: String(error) };
}

export function fromWire(wire: WireError): Error {
	if (wire.name === "TextTooLongError" && wire.limit !== undefined) {
		return new TextTooLongError(wire.limit);
	}
	const error = new Error(wire.message);
	error.name = wire.name;
	return error;
}

/** The worker's global scope (this package's tsconfig has no worker lib). */
declare const self: unknown;
const workerScope = () =>
	self as {
		postMessage(message: FromWorker): void;
		addEventListener(
			type: "message",
			listener: (event: MessageEvent<ToWorker>) => void,
		): void;
	};

/**
 * The worker side: waits for `init`, builds the translator with `load` (the
 * native library is opened here, inside the worker thread), then answers
 * `translate` messages one at a time. Each call blocks only this thread.
 */
export function serveTranslations<Init>(
	load: (init: Init) => Translate | Promise<Translate>,
): void {
	const port = workerScope();
	let translate: Translate | undefined;
	port.addEventListener("message", async (event) => {
		const message = event.data;
		if (message.type === "init") {
			try {
				translate = await load(message.init as Init);
				port.postMessage({ type: "ready" });
			} catch (error) {
				port.postMessage({ type: "init-failed", error: toWire(error) });
			}
			return;
		}
		if (!translate) {
			port.postMessage({
				type: "failed",
				id: message.id,
				error: { name: "Error", message: "translator is not loaded" },
			});
			return;
		}
		try {
			port.postMessage({
				type: "result",
				id: message.id,
				text: translate(message.text),
			});
		} catch (error) {
			port.postMessage({
				type: "failed",
				id: message.id,
				error: toWire(error),
			});
		}
	});
}
