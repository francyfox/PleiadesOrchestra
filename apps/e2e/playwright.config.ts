import { defineConfig, devices } from "@playwright/test";
import { DOCS_TEST_ENV } from "./tests/playground-env";

export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: "list",
	use: {
		baseURL: "http://localhost:4310",
		trace: "retain-on-failure",
	},
	// System google-chrome-stable, not Playwright's own bundled Chromium
	// download — one less thing to fetch/cache, and it's what's actually on
	// this machine already.
	projects: [
		{
			name: "chrome",
			use: { ...devices["Desktop Chrome"], channel: "chrome" },
		},
	],
	webServer: [
		{
			command: "bun run server.ts",
			url: "http://localhost:4310/widget.html",
			reuseExistingServer: !process.env.CI,
		},
		{
			// The docs site, built for the mocked playground tests: a fake agent
			// origin (every /v1/widget/* call is intercepted by page.route), one
			// shared key and own keys for two demos so both channel modes are
			// covered. Needs packages/pleiades-widget built (the root test:e2e does).
			command: `cd ../docs && ${DOCS_TEST_ENV} bun run build && cd ../e2e && bun run docs-server.ts`,
			url: "http://localhost:4311/playground/",
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
		},
	],
});
