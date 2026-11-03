// PWA for the landing and the docs only (`pwaRoute`): the playground, its demos and the CMS
// are never answered from here. SvelteKit registers this file itself.

import { PWA_ASSETS, pwaRoute } from "#lib/pwa.js";
import { version } from "$app/env";
import { immutable, prerendered } from "$app/manifest";
import { self } from "$app/service-worker";

const CACHE = `pleiades-${version}`;
const LANDINGS = ["/", "/ru/", "/kk/"];
// The shell only: entry modules and stylesheets (all of `immutable` is ~13 MB); other
// hashed files are cached on first use.
const SHELL = [
	...immutable
		.map(({ path }) => `/${path}`)
		.filter((path) => path.includes("/entry/") || path.endsWith(".css")),
	...PWA_ASSETS,
	// Manifest paths are base-relative without a leading slash ("" is the home page).
	...prerendered
		.map(({ path }) => `/${path}`)
		.filter((path) => LANDINGS.includes(path)),
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(SHELL))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	const route = pwaRoute(url.pathname);
	if (!route) return;
	event.respondWith(
		route === "page" ? networkFirst(request) : cacheFirst(request),
	);
});

/** Pages: always fresh when online; the last copy when not. */
async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (response.ok) void cache.put(request, response.clone());
		return response;
	} catch (error) {
		const cached = await cache.match(request);
		if (cached) return cached;
		throw error;
	}
}

/** Hashed files and icons never change under one name. */
async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) void cache.put(request, response.clone());
	return response;
}
