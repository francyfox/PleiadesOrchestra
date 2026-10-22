import { type CollectedTokens, reportTokens } from "@repo/core";
import {
	type FromWorker,
	fromWire,
	type ToWorker,
} from "./translate-protocol.ts";

export class TranslateTimeoutError extends Error {
	constructor(readonly timeoutMs: number) {
		super(`translation took longer than ${timeoutMs} ms`);
		this.name = "TranslateTimeoutError";
	}
}

export class TranslateWorkerExitedError extends Error {
	constructor(detail: string) {
		super(`translation worker stopped: ${detail}`);
		this.name = "TranslateWorkerExitedError";
	}
}

export class TranslatePoolClosedError extends Error {
	constructor() {
		super("translator is closed");
		this.name = "TranslatePoolClosedError";
	}
}

/**
 * The URL of a worker entry point, `entry` being its path from the main
 * entry's folder without extension. From source that is the `.ts` file. In a
 * `bun build --compile` binary (`main` under `/$bunfs/`) every module's
 * `import.meta.url` is the binary itself, and the extra entry point is
 * embedded relative to the entry points' common root, as `.js` (Bun 1.3; 1.4
 * also accepts `.ts`).
 */
export function workerEntryUrl(entry: string, main: string = Bun.main): URL {
	const compiled = main.startsWith("/$bunfs/");
	return new URL(
		`./${entry}${compiled ? ".js" : ".ts"}`,
		Bun.pathToFileURL(main),
	);
}

export interface TranslatePoolOptions {
	/** The worker's entry file; it calls `serveTranslations` (see `translate.worker.ts`). */
	workerUrl: string | URL;
	/** Posted to every worker as it starts: how to load its engine. */
	init: unknown;
	/** Workers, each with its own engine (and its own copy of the model). */
	size: number;
	/** A call running longer than this is rejected and its worker replaced. */
	timeoutMs: number;
	/** A worker that died, hung or could not be restarted (the pool goes on). */
	onError?: (error: unknown) => void;
}

export interface TranslatePool {
	translate(text: string): Promise<string>;
	close(): void;
}

interface Job {
	text: string;
	resolve(answer: { text: string; tokens?: CollectedTokens }): void;
	reject(error: unknown): void;
}

interface Running extends Job {
	id: number;
	timer: ReturnType<typeof setTimeout>;
}

interface Slot {
	worker: Worker;
	state: "starting" | "ready" | "dead";
	job?: Running;
}

/**
 * Translations off the main thread. The native call (CTranslate2 over
 * bun:ffi, 30–60 ms) is synchronous: made on the main thread it froze every
 * other request and stream for its duration. Here each worker owns one engine
 * and runs one call at a time; calls wait in a FIFO queue on this side.
 *
 * A worker that crashes or overruns `timeoutMs` rejects its call and is
 * replaced; the queue goes on to the new one. Resolves once every worker has
 * loaded its engine, rejects (all workers stopped) when one can't.
 */
export async function createTranslatePool(
	options: TranslatePoolOptions,
): Promise<TranslatePool> {
	const queue: Job[] = [];
	const slots: Slot[] = [];
	let nextId = 1;
	let closed = false;

	const send = (worker: Worker, message: ToWorker) =>
		worker.postMessage(message);

	/** Starts a worker in `slot`; settles when its engine is loaded or failed to. */
	function start(slot: Slot): Promise<void> {
		const worker = new Worker(options.workerUrl);
		slot.worker = worker;
		slot.state = "starting";
		const current = () => slot.worker === worker && !closed;
		return new Promise<void>((resolve, reject) => {
			worker.addEventListener("message", (event: MessageEvent<FromWorker>) => {
				if (!current()) return;
				const message = event.data;
				switch (message.type) {
					case "ready":
						slot.state = "ready";
						resolve();
						pump();
						return;
					case "init-failed":
						slot.state = "dead";
						worker.terminate();
						reject(fromWire(message.error));
						return;
					case "result":
					case "failed": {
						const job = slot.job;
						if (!job || job.id !== message.id) return;
						clearTimeout(job.timer);
						slot.job = undefined;
						if (message.type === "result")
							job.resolve({ text: message.text, tokens: message.tokens });
						else job.reject(fromWire(message.error));
						pump();
					}
				}
			});
			const died = (detail: string) => {
				if (!current()) return;
				const error = new TranslateWorkerExitedError(detail);
				if (slot.state === "starting") {
					slot.state = "dead";
					reject(error);
					return;
				}
				replace(slot, error);
			};
			worker.addEventListener("error", (event) =>
				died((event as ErrorEvent).message || "uncaught error"),
			);
			worker.addEventListener("close", (event) =>
				died(`exited with code ${(event as CloseEvent).code}`),
			);
			send(worker, { type: "init", init: options.init });
		});
	}

	/** Fails the slot's call with `error`, stops its worker and starts another in its place. */
	function replace(slot: Slot, error: Error): void {
		const job = slot.job;
		slot.job = undefined;
		if (job) {
			clearTimeout(job.timer);
			job.reject(error);
		}
		options.onError?.(error);
		slot.worker.terminate();
		start(slot).catch((startError: unknown) => {
			options.onError?.(startError);
			// No worker left to wait for: nothing in the queue would ever run.
			if (slots.every((s) => s.state === "dead")) {
				for (const waiting of queue.splice(0)) waiting.reject(startError);
			}
		});
	}

	function pump(): void {
		for (const slot of slots) {
			if (queue.length === 0) return;
			if (slot.state !== "ready" || slot.job) continue;
			const job = queue.shift() as Job;
			const id = nextId++;
			slot.job = {
				...job,
				id,
				timer: setTimeout(
					() => replace(slot, new TranslateTimeoutError(options.timeoutMs)),
					options.timeoutMs,
				),
			};
			send(slot.worker, { type: "translate", id, text: job.text });
		}
	}

	function close(): void {
		if (closed) return;
		closed = true;
		const error = new TranslatePoolClosedError();
		for (const slot of slots) {
			if (slot.job) {
				clearTimeout(slot.job.timer);
				slot.job.reject(error);
				slot.job = undefined;
			}
			slot.state = "dead";
			slot.worker.terminate();
		}
		for (const job of queue.splice(0)) job.reject(error);
	}

	const starting: Promise<void>[] = [];
	for (let i = 0; i < Math.max(1, options.size); i++) {
		const slot = { state: "starting" } as Slot;
		slots.push(slot);
		starting.push(start(slot));
	}
	try {
		await Promise.all(starting);
	} catch (error) {
		close();
		throw error;
	}

	return {
		async translate(text) {
			const answer = await enqueue(text);
			// Back in the caller's async context: the event handler that got the answer is not in it.
			if (answer.tokens) reportTokens(answer.tokens);
			return answer.text;
		},
		close,
	};

	function enqueue(text: string) {
		if (closed) return Promise.reject(new TranslatePoolClosedError());
		if (slots.every((s) => s.state === "dead")) {
			return Promise.reject(
				new TranslateWorkerExitedError("no translation worker is running"),
			);
		}
		return new Promise<{ text: string; tokens?: CollectedTokens }>(
			(resolve, reject) => {
				queue.push({ text, resolve, reject });
				pump();
			},
		);
	}
}
