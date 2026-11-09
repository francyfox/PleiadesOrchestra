import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

// Local WordPress + WooCommerce from compose.wp.yml (make wp-up), plugin active, demo data imported.
export const WP = process.env.WORDPRESS_URL ?? "http://localhost:8088";

/** Call at the top of a spec: skips every test when the site is down. */
export function skipUnlessWordPress() {
	let reachable = false;
	test.beforeAll(async () => {
		reachable = await fetch(WP, {
			keepalive: false,
			signal: AbortSignal.timeout(3000),
		})
			.then((r) => r.ok)
			.catch(() => false);
	});
	test.beforeEach(() => test.skip(!reachable, `${WP} is not reachable`));
}

export const wpcli = (...args: string[]) =>
	execFileSync(
		"docker",
		[
			"compose",
			"-f",
			"../../compose.wp.yml",
			"run",
			"--rm",
			"-T",
			"--entrypoint",
			"wp",
			"wordpress-setup",
			...args,
		],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
	).trim();

export type Reply = { ok: true; data: unknown } | { ok: false; error: string };

/** Runs a registered WebMCP tool through document.modelContext; a thrown error or an `isError` result is `{ok:false}`. */
export async function tool(
	page: Page,
	name: string,
	args: object,
	raw = false,
): Promise<Reply> {
	return page.evaluate(
		async ([n, a, asText]) => {
			const mc = (
				document as unknown as {
					modelContext: {
						getTools(): Promise<{ name: string }[]>;
						executeTool(t: unknown, args: string): Promise<string | object>;
					};
				}
			).modelContext;
			const t = (await mc.getTools()).find((x) => x.name === n);
			try {
				const res = await mc.executeTool(t, JSON.stringify(a));
				const out = (typeof res === "string" ? JSON.parse(res) : res) as {
					content: { text: string }[];
					isError?: boolean;
				};
				const text = out.content[0].text;
				if (out.isError) return { ok: false as const, error: text };
				return { ok: true as const, data: asText ? text : JSON.parse(text) };
			} catch (e) {
				return { ok: false as const, error: String((e as Error).message) };
			}
		},
		[name, args, raw] as const,
	);
}

/** A failed tool call is a JSON `{error_code, status?}` (never the shop's own text); `status` is checked when given. */
export function expectCode(r: Reply, code: string, status?: number) {
	expect(r.ok).toBe(false);
	const text = (r as { error: string }).error;
	const payload = JSON.parse(text) as { error_code: string; status?: number };
	expect(payload.error_code).toBe(code);
	if (status !== undefined) expect(payload.status).toBe(status);
	// Only our fields (`options` is catalog data, VARIATION_REQUIRED only): no shop message can ride along.
	expect(
		Object.keys(payload).every((k) =>
			["error_code", "status", "hint", "options"].includes(k),
		),
	).toBe(true);
}

/** The data of a successful tool call; throws with the tool's error otherwise. */
export function ok<T = unknown>(r: Reply): T {
	if (!r.ok) throw new Error(r.error);
	return r.data as T;
}

// Via the context's request (same cookies), not page.evaluate: the plugin may reload the page right after a turn.
export const cartCount = async (page: Page) =>
	(
		(await (
			await page.request.get(`${WP}/wp-json/wc/store/v1/cart`)
		).json()) as {
			items_count: number;
		}
	).items_count;

export interface Product {
	id: number;
	name: string;
	url: string;
}
export interface Cart {
	count: number;
	items: { key: string; id: number; name: string; quantity: number }[];
}
