import { describe, expect, test } from "bun:test";
import {
	call,
	json,
	setRespond,
	signedIn,
	upstream,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

describe("finance rates (proxied)", () => {
	const rates = {
		feeFixedUsd: 0.7,
		feePercent: 7.9,
		payoutPercent: 1.5,
		taxPercent: 3,
		conversionPercent: 2,
		marginPercent: 10,
		taxBase: "revenue",
	};

	test("rates are read and saved upstream; out-of-range rates never reach it", async () => {
		const cookie = await signedIn();
		setRespond(() => json(rates));
		expect(await (await call("/api/finance/rates", { cookie })).json()).toEqual(
			rates,
		);
		const saved = await call("/api/finance/rates", {
			method: "PUT",
			cookie,
			body: rates,
		});
		expect(saved.status).toBe(200);
		const put = upstream.at(-1);
		expect(put?.url).toBe("http://orchestrator/v1/admin/finance/rates");
		expect(put?.body).toEqual(rates);
		const count = upstream.length;
		const bad = await call("/api/finance/rates", {
			method: "PUT",
			cookie,
			body: { ...rates, taxPercent: 101 },
		});
		expect(bad.status).toBe(422);
		expect(upstream.length).toBe(count);
	});
});
