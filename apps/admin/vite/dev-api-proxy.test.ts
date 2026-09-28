import { afterEach, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApiProxy, createUpgradeProxy } from "./dev-api-proxy";

const servers: Server[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

async function listen(handler: Parameters<typeof createServer>[1]) {
	const server = createServer(handler);
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A dev server whose only middleware is the proxy; unmatched paths fall through to `next`. */
async function proxyTo(upstream: string) {
	const proxy = createApiProxy(upstream);
	return listen((req, res) =>
		proxy(req, res, () => {
			res.statusCode = 404;
			res.end("next");
		}),
	);
}

test("forwards method, path, query and body, and returns status, body and every cookie", async () => {
	const seen: { method?: string; url?: string; body: string; cookie?: string } =
		{
			body: "",
		};
	const upstream = await listen((req, res) => {
		seen.method = req.method;
		seen.url = req.url;
		seen.cookie = req.headers.cookie;
		req.on("data", (chunk) => {
			seen.body += chunk;
		});
		req.on("end", () => {
			res.statusCode = 201;
			res.setHeader("content-type", "application/json");
			res.setHeader("set-cookie", ["a=1; Path=/", "b=2; Path=/"]);
			res.end(JSON.stringify({ ok: true }));
		});
	});
	const dev = await proxyTo(upstream);

	const response = await fetch(`${dev}/api/users?limit=5`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie: "sid=xyz" },
		body: JSON.stringify({ hello: "world" }),
	});

	expect(response.status).toBe(201);
	expect(await response.json()).toEqual({ ok: true });
	expect(response.headers.getSetCookie()).toEqual([
		"a=1; Path=/",
		"b=2; Path=/",
	]);
	expect(seen).toEqual({
		method: "POST",
		url: "/api/users?limit=5",
		cookie: "sid=xyz",
		body: '{"hello":"world"}',
	});
});

test("passes non-/api requests on to the next middleware", async () => {
	const dev = await proxyTo("http://127.0.0.1:1");
	const response = await fetch(`${dev}/users`);
	expect(response.status).toBe(404);
	expect(await response.text()).toBe("next");
});

test("answers 502 when admin-api is not running", async () => {
	const dev = await proxyTo("http://127.0.0.1:1");
	const response = await fetch(`${dev}/api/session`);
	expect(response.status).toBe(502);
	expect(await response.text()).toContain("admin-api");
});

test("passes redirects through untouched", async () => {
	const upstream = await listen((_req, res) => {
		res.statusCode = 303;
		res.setHeader("location", "/login");
		res.end();
	});
	const dev = await proxyTo(upstream);
	const response = await fetch(`${dev}/api/x`, { redirect: "manual" });
	expect(response.status).toBe(303);
	expect(response.headers.get("location")).toBe("/login");
});

test("proxies the original URL when an earlier middleware rewrote req.url (vite-intlayer's /ru prefix)", async () => {
	let seen = "";
	const upstream = await listen((req, res) => {
		seen = req.url ?? "";
		res.end("ok");
	});
	const proxy = createApiProxy(upstream);
	const dev = await listen((req, res) => {
		const rewritten = req as typeof req & { originalUrl?: string };
		rewritten.originalUrl = req.url;
		req.url = `/ru${req.url}`;
		proxy(req, res, () => {
			res.statusCode = 404;
			res.end("next");
		});
	});

	const response = await fetch(`${dev}/api/session?x=1`);
	expect(await response.text()).toBe("ok");
	expect(seen).toBe("/api/session?x=1");
});

/** Upstream websocket server that says who connected and echoes messages. */
function echoServer() {
	const seen: { url?: string; origin?: string | null; cookie?: string | null } =
		{};
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(request, bunServer) {
			seen.url = new URL(request.url).pathname;
			seen.origin = request.headers.get("origin");
			seen.cookie = request.headers.get("cookie");
			return bunServer.upgrade(request)
				? undefined
				: new Response("no", { status: 400 });
		},
		websocket: {
			open(socket) {
				socket.send("hello");
			},
			message(socket, message) {
				socket.send(`echo:${message}`);
			},
		},
	});
	return { server, seen, url: `http://127.0.0.1:${server.port}` };
}

async function devWithUpgradeProxy(upstream: string) {
	const proxy = createUpgradeProxy(upstream);
	const server = createServer();
	server.on("upgrade", (req, socket, head) => proxy(req, socket, head));
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function nextMessage(socket: WebSocket): Promise<string> {
	return new Promise((resolve, reject) => {
		socket.addEventListener("message", (event) => resolve(String(event.data)), {
			once: true,
		});
		socket.addEventListener("error", () => reject(new Error("socket error")), {
			once: true,
		});
	});
}

test("tunnels a websocket upgrade on /api/*, keeping path, Origin and cookie", async () => {
	const upstream = echoServer();
	try {
		const dev = await devWithUpgradeProxy(upstream.url);
		const socket = new WebSocket(`${dev}/api/system/stream`, {
			headers: { origin: "http://localhost:3002", cookie: "sid=xyz" },
		} as unknown as string[]);
		expect(await nextMessage(socket)).toBe("hello");
		socket.send("ping");
		expect(await nextMessage(socket)).toBe("echo:ping");
		socket.close();
		expect(upstream.seen).toEqual({
			url: "/api/system/stream",
			origin: "http://localhost:3002",
			cookie: "sid=xyz",
		});
	} finally {
		upstream.server.stop(true);
	}
});

test("leaves upgrades outside /api alone (Vite's own HMR socket)", async () => {
	const upstream = echoServer();
	try {
		const proxy = createUpgradeProxy(upstream.url);
		let destroyed = false;
		const handled = proxy(
			{ url: "/", headers: {} } as never,
			{ destroy: () => (destroyed = true) } as never,
			Buffer.alloc(0),
		);
		expect(handled).toBe(false);
		expect(destroyed).toBe(false);
	} finally {
		upstream.server.stop(true);
	}
});

test("closes the client when admin-api is unreachable", async () => {
	const dev = await devWithUpgradeProxy("http://127.0.0.1:1");
	const socket = new WebSocket(`${dev}/api/system/stream`);
	const outcome = await new Promise<string>((resolve) => {
		socket.addEventListener("error", () => resolve("error"), { once: true });
		socket.addEventListener("close", () => resolve("close"), { once: true });
	});
	expect(["error", "close"]).toContain(outcome);
});
