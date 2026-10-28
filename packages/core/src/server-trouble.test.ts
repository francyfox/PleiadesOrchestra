import { expect, test } from "bun:test";
import {
	attemptsOf,
	newTally,
	reportingTrouble,
	tallyingAttempts,
	watchServerTrouble,
} from "#core/server-trouble";

const fake = (respond: () => Promise<Response>) =>
	respond as unknown as typeof fetch;
const answer = (status: number) =>
	fake(async () => new Response("", { status }));

test("an overloaded, failing or unreachable server is heard; a good answer says it is fine", async () => {
	const heard: boolean[] = [];
	await watchServerTrouble(
		(ok) => heard.push(ok),
		async () => {
			await reportingTrouble(answer(429))("http://m");
			await reportingTrouble(answer(503))("http://m");
			await reportingTrouble(answer(400))("http://m");
			await expect(
				reportingTrouble(
					fake(async () => {
						throw new TypeError("connection refused");
					}),
				)("http://m"),
			).rejects.toThrow("connection refused");
			await reportingTrouble(answer(200))("http://m");
		},
	);
	// A 400 is our request, not the server's trouble: it says nothing either way.
	expect(heard).toEqual([false, false, false, true]);
});

test("a cancelled request is the visitor leaving, not the server", async () => {
	const heard: boolean[] = [];
	await watchServerTrouble(
		(ok) => heard.push(ok),
		async () => {
			await expect(
				reportingTrouble(
					fake(async () => {
						throw new DOMException("aborted", "AbortError");
					}),
				)("http://m"),
			).rejects.toThrow();
		},
	);
	expect(heard).toEqual([]);
});

test("outside a watch nothing breaks", async () => {
	expect((await reportingTrouble(answer(429))("http://m")).status).toBe(429);
});

test("every HTTP attempt of a call is counted with the status of the failed ones", async () => {
	const tally = newTally();
	const statuses = [429, 503, 200];
	const send = fake(async () => new Response("", { status: statuses.shift() }));
	await tallyingAttempts(tally, async () => {
		for (let i = 0; i < 3; i++) await reportingTrouble(send)("http://m");
	});
	expect(attemptsOf(tally)).toEqual({
		attempts: 3,
		failedStatuses: [429, 503],
	});
	// A refused connection has no status: 0.
	const refused = newTally();
	await tallyingAttempts(refused, () =>
		reportingTrouble(
			fake(async () => {
				throw new TypeError("refused");
			}),
		)("http://m").catch(() => {}),
	);
	expect(attemptsOf(refused)).toEqual({ attempts: 1, failedStatuses: [0] });
	// No request, no claim.
	expect(attemptsOf(newTally())).toEqual({});
});
