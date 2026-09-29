import { defineConfig, devices } from "@playwright/test";

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
	webServer: {
		command: "bun run server.ts",
		url: "http://localhost:4310/widget.html",
		reuseExistingServer: !process.env.CI,
	},
});
