import { afterEach, describe, expect, test } from "bun:test";
import { TextTooLongError } from "./translate.service.ts";
import {
	createTranslatePool,
	type TranslatePool,
	TranslatePoolClosedError,
	TranslateTimeoutError,
	TranslateWorkerExitedError,
} from "./translate-pool.ts";

/** A worker speaking the real protocol over a fake engine (see the file for its commands). */
const FAKE_WORKER = new URL(
	"./translate-fake.worker.testing.ts",
	import.meta.url,
);

/**
 * The error a promise rejects with. Not `expect(p).rejects`: under bun test
 * it waits for the promise without servicing worker messages, so a call
 * answered by a worker looks stuck (see docs/lessons-learned.md).
 */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected the promise to reject");
}

const pools: TranslatePool[] = [];
afterEach(() => {
	for (const pool of pools.splice(0)) pool.close();
});

async function pool(
	options: { size?: number; timeoutMs?: number; init?: unknown } = {},
) {
	const errors: unknown[] = [];
	const created = await createTranslatePool({
		workerUrl: FAKE_WORKER,
		init: options.init ?? {},
		size: options.size ?? 1,
		timeoutMs: options.timeoutMs ?? 5_000,
		onError: (error) => errors.push(error),
	});
	pools.push(created);
	return { ...created, errors };
}

describe("createTranslatePool", () => {
	test("a text goes to the worker and its translation comes back", async () => {
		const { translate } = await pool();
		expect(await translate("купи сыр")).toStartWith("[купи сыр]");
	});

	test("the event loop keeps running while a translation blocks the worker", async () => {
		const { translate } = await pool();
		let ticks = 0;
		const timer = setInterval(() => ticks++, 10);
		let timerFiredFirst = false;
		setTimeout(() => {
			timerFiredFirst = true;
		}, 20);
		try {
			// The fake engine blocks its thread for 300 ms, as the FFI call does.
			const result = await translate("slow:300");
			expect(result).toStartWith("[slow:300]");
		} finally {
			clearInterval(timer);
		}
		expect(timerFiredFirst).toBe(true);
		expect(ticks).toBeGreaterThanOrEqual(10);
	});

	test("calls made at once are queued behind each other on one worker and all answered in order", async () => {
		const { translate } = await pool({ size: 1 });
		const finished: string[] = [];
		const texts = ["slow:40 a", "slow:40 b", "slow:40 c"];
		const results = await Promise.all(
			texts.map(async (text) => {
				const result = await translate(text);
				finished.push(text);
				return result;
			}),
		);
		expect(results.map((r) => r.split(" by ")[0])).toEqual(
			texts.map((text) => `[${text}]`),
		);
		expect(finished).toEqual(texts);
	});

	test("two workers translate side by side", async () => {
		const { translate } = await pool({ size: 2 });
		const started = performance.now();
		const results = await Promise.all([
			translate("slow:200 a"),
			translate("slow:200 b"),
		]);
		const elapsed = performance.now() - started;
		const workers = new Set(results.map((r) => r.split(" by ")[1]));
		expect(workers.size).toBe(2);
		expect(elapsed).toBeLessThan(380);
	});

	test("an engine error rejects that call with its message; the worker goes on", async () => {
		const { translate } = await pool();
		expect(await rejection(translate("boom"))).toHaveProperty(
			"message",
			"model exploded",
		);
		expect(await translate("ещё")).toStartWith("[ещё]");
	});

	test("a text over the limit is still a TextTooLongError on this side", async () => {
		const { translate } = await pool();
		const error = await translate("too-long").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(TextTooLongError);
		expect((error as TextTooLongError).limit).toBe(10);
	});

	test("a crashed worker rejects its call, is replaced, and the calls queued behind it are answered", async () => {
		const { translate, errors } = await pool({ size: 1 });
		const crashed = translate("crash");
		const behind = [translate("после 1"), translate("после 2")];
		expect(await rejection(crashed)).toBeInstanceOf(TranslateWorkerExitedError);
		const answers = await Promise.all(behind);
		expect(answers[0]).toStartWith("[после 1]");
		expect(answers[1]).toStartWith("[после 2]");
		expect(errors.length).toBeGreaterThanOrEqual(1);
	});

	test("a worker stuck past the timeout is dropped and its call rejected; the next call works", async () => {
		const { translate, errors } = await pool({ timeoutMs: 150 });
		expect(await rejection(translate("hang"))).toBeInstanceOf(
			TranslateTimeoutError,
		);
		expect(await translate("снова")).toStartWith("[снова]");
		expect(errors.length).toBeGreaterThanOrEqual(1);
	});

	test("a worker that cannot load the engine fails the pool's start", async () => {
		expect(
			await rejection(
				createTranslatePool({
					workerUrl: FAKE_WORKER,
					init: { failInit: "no libtranslator.so" },
					size: 2,
					timeoutMs: 1_000,
				}),
			),
		).toHaveProperty("message", "no libtranslator.so");
	});

	test("closing the pool rejects what is still waiting and every later call", async () => {
		const created = await createTranslatePool({
			workerUrl: FAKE_WORKER,
			init: {},
			size: 1,
			timeoutMs: 5_000,
		});
		const inFlight = created.translate("slow:200");
		const queued = created.translate("queued");
		created.close();
		expect(await rejection(inFlight)).toBeInstanceOf(TranslatePoolClosedError);
		expect(await rejection(queued)).toBeInstanceOf(TranslatePoolClosedError);
		expect(await rejection(created.translate("later"))).toBeInstanceOf(
			TranslatePoolClosedError,
		);
	});
});
