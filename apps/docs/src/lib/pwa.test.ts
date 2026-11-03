import { expect, test } from "bun:test";
import { pwaRoute } from "./pwa.ts";

test("the service worker serves the landing and the docs pages, their app files and the shell assets", () => {
	for (const path of [
		"/",
		"/ru/",
		"/kk/",
		"/docs/intro/",
		"/ru/docs/intro/",
		"/kk/docs/x/",
	])
		expect(pwaRoute(path)).toBe("page");
	expect(pwaRoute("/_app/immutable/chunks/a1b2.js")).toBe("immutable");
	for (const path of ["/manifest.webmanifest", "/logo.svg", "/icon-192.png"])
		expect(pwaRoute(path)).toBe("asset");
});

test("the playground, its demos, the CMS, media and agent files stay out of it", () => {
	for (const path of [
		"/playground/",
		"/ru/playground/",
		"/playground-demos/basketful/index.html",
		"/admin/",
		"/media/draft.webm",
		"/llms.txt",
		"/docs/intro/index.html.md",
		"/benchmarks/a.txt",
	])
		expect(pwaRoute(path)).toBeNull();
});
