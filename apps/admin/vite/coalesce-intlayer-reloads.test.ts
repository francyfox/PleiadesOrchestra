import { expect, test } from "bun:test";
import { coalesceIntlayerReloads } from "./coalesce-intlayer-reloads";

function fakeServer() {
	const sent: unknown[] = [];
	return {
		sent,
		server: { ws: { send: (payload: unknown) => sent.push(payload) } },
	};
}

// biome-ignore lint/suspicious/noExplicitAny: calling the Vite hook with a minimal fake
const hook = (plugin: any) => plugin.hotUpdate as (o: any) => unknown;

test("a burst of dictionary rebuilds becomes one full reload", async () => {
	const plugin = coalesceIntlayerReloads({ delayMs: 20 });
	const { sent, server } = fakeServer();
	for (const name of ["common", "users", "admins", "auth"]) {
		const result = hook(plugin)({
			file: `/app/.intlayer/dictionary/${name}.json`,
			server,
		});
		// Vite's own per-file reload is suppressed.
		expect(result).toEqual([]);
	}
	expect(sent).toEqual([]);
	await Bun.sleep(60);
	expect(sent).toEqual([{ type: "full-reload" }]);
});

test("other files keep Vite's normal HMR", () => {
	const plugin = coalesceIntlayerReloads({ delayMs: 20 });
	const { sent, server } = fakeServer();
	expect(
		hook(plugin)({ file: "/app/src/routes/+page.svelte", server }),
	).toBeUndefined();
	expect(sent).toEqual([]);
});
