/**
 * Test worker: the real worker protocol (`serveTranslations`) over a fake
 * engine, so the pool can be tested without libtranslator.so. Commands, read
 * from the text:
 * - `slow:<ms> …` blocks this thread for <ms> (like the synchronous FFI call)
 * - `boom` — the engine throws; `too-long` — a TextTooLongError(10)
 * - `tokens` — reports 5 input and 3 output tokens
 * - `crash` — the worker exits; `hang` — never returns
 * Anything else comes back as `[text] by <threadId>`.
 * Init `{ failInit: "msg" }` makes loading the engine throw.
 */

import { threadId } from "node:worker_threads";
import { reportTokens } from "@repo/core";
import { TextTooLongError } from "./translate.service.ts";
import { serveTranslations } from "./translate-protocol.ts";

serveTranslations((init: { failInit?: string }) => {
	if (init.failInit) throw new Error(init.failInit);
	return (text) => {
		const slow = /^slow:(\d+)/.exec(text);
		if (slow) Bun.sleepSync(Number(slow[1]));
		if (text === "boom") throw new Error("model exploded");
		if (text === "too-long") throw new TextTooLongError(10);
		if (text === "tokens") reportTokens({ inputTokens: 5, outputTokens: 3 });
		if (text === "crash") process.exit(1);
		if (text === "hang") while (true) {}
		return `[${text}] by ${threadId}`;
	};
});
