import type { Page } from "@playwright/test";

export interface WidgetMockOptions {
	/** NDJSON lines the first `POST /v1/widget/messages` call answers with. */
	firstReply: string[];
	/** NDJSON lines `POST /v1/widget/tool-results` answers with, if the test expects a resume. */
	toolResultReply?: string[];
}

export interface RecordedRequest {
	path: "tools" | "messages" | "tool-results";
	body: unknown;
}

/**
 * Stubs the whole `/v1/widget/*` surface the widget's `WidgetApi`
 * (`src/lib/api.ts`) talks to — no real orchestrator needed. Returns the
 * bodies of every `/tools`/`/messages`/`/tool-results` call, in order, so a
 * test can assert on exactly what the widget sent (e.g. that the tool
 * catalog was registered once via `/v1/widget/tools`, not resent with every
 * message). Must be called before `page.goto`.
 */
export async function mockWidgetApi(
	page: Page,
	options: WidgetMockOptions,
): Promise<RecordedRequest[]> {
	const requests: RecordedRequest[] = [];

	await page.route("**/v1/widget/visitors", (route) =>
		route.fulfill({
			status: 201,
			contentType: "application/json",
			body: JSON.stringify({
				visitorToken: "tok-e2e",
				expiresAt: Date.now() + 60_000,
			}),
		}),
	);
	await page.route("**/v1/widget/threads", (route) =>
		route.fulfill({
			status: 201,
			contentType: "application/json",
			body: JSON.stringify({ threadId: "thread-e2e" }),
		}),
	);
	await page.route("**/v1/widget/threads/*/messages", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: [] }),
		}),
	);
	await page.route("**/v1/widget/tools", async (route) => {
		requests.push({ path: "tools", body: route.request().postDataJSON() });
		await route.fulfill({ status: 204 });
	});
	await page.route("**/v1/widget/messages", async (route) => {
		requests.push({ path: "messages", body: route.request().postDataJSON() });
		await route.fulfill({
			status: 200,
			contentType: "application/x-ndjson",
			body: `${options.firstReply.join("\n")}\n`,
		});
	});
	await page.route("**/v1/widget/tool-results", async (route) => {
		requests.push({
			path: "tool-results",
			body: route.request().postDataJSON(),
		});
		await route.fulfill({
			status: 200,
			contentType: "application/x-ndjson",
			body: `${(options.toolResultReply ?? []).join("\n")}\n`,
		});
	});

	return requests;
}
