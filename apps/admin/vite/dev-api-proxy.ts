import type { IncomingMessage, ServerResponse } from "node:http";
import { connect } from "node:net";
import { type Duplex, Readable } from "node:stream";
import type { Plugin } from "vite";

type Next = (error?: unknown) => void;

// Hop-by-hop headers must not be forwarded (RFC 9110 §7.6.1).
const HOP_BY_HOP = new Set([
	"connection",
	"keep-alive",
	"transfer-encoding",
	"upgrade",
	"host",
	"content-length",
]);

const isApiPath = (url: string) =>
	url === "/api" || url.startsWith("/api/") || url.startsWith("/api?");

/**
 * Connect middleware sending `/api/*` to admin-api, path and query as is.
 * Uses `fetch`, so multiple `Set-Cookie` headers survive and redirects are
 * passed to the browser untouched.
 */
export function createApiProxy(target: string) {
	const base = target.replace(/\/+$/, "");

	return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
		// `originalUrl`: vite-intlayer's dev middleware has already rewritten
		// `req.url` to `/ru/api/…` by the time this runs.
		const url =
			(req as IncomingMessage & { originalUrl?: string }).originalUrl ??
			req.url ??
			"/";
		if (!isApiPath(url)) return next();

		const headers = new Headers();
		for (const [name, value] of Object.entries(req.headers)) {
			if (value === undefined || HOP_BY_HOP.has(name)) continue;
			headers.set(name, Array.isArray(value) ? value.join(", ") : value);
		}
		const hasBody = req.method !== "GET" && req.method !== "HEAD";

		try {
			const upstream = await fetch(`${base}${url}`, {
				method: req.method,
				headers,
				body: hasBody
					? (Readable.toWeb(req) as unknown as ReadableStream)
					: undefined,
				// @ts-expect-error `duplex` is required for streamed bodies, missing from the DOM types
				duplex: "half",
				redirect: "manual",
			});

			res.statusCode = upstream.status;
			for (const [name, value] of upstream.headers) {
				if (HOP_BY_HOP.has(name) || name === "set-cookie") continue;
				res.setHeader(name, value);
			}
			const cookies = upstream.headers.getSetCookie();
			if (cookies.length > 0) res.setHeader("set-cookie", cookies);
			res.end(Buffer.from(await upstream.arrayBuffer()));
		} catch (error) {
			res.statusCode = 502;
			res.setHeader("content-type", "text/plain");
			res.end(
				`admin-api unreachable at ${base} (${error instanceof Error ? error.message : String(error)}). Start it: bun --cwd apps/admin-api run dev`,
			);
		}
	};
}

/**
 * `upgrade` handler tunnelling WebSocket handshakes on `/api/*` to admin-api
 * (raw TCP: the handshake and every frame pass through untouched, so `Origin`
 * and the session cookie reach admin-api's own checks). Returns whether it
 * took the connection — anything else (Vite's HMR socket) is left alone.
 * Plain `http:` targets only, which is all a dev server needs.
 */
export function createUpgradeProxy(target: string) {
	const base = new URL(target);
	const port = Number(base.port) || 80;

	return (req: IncomingMessage, socket: Duplex, head: Buffer): boolean => {
		const url =
			(req as IncomingMessage & { originalUrl?: string }).originalUrl ??
			req.url ??
			"/";
		if (!isApiPath(url)) return false;

		const upstream = connect({ host: base.hostname, port });
		const close = () => {
			socket.destroy();
			upstream.destroy();
		};
		upstream.once("connect", () => {
			const lines = [`${req.method} ${url} HTTP/1.1`];
			for (let index = 0; index < req.rawHeaders.length; index += 2) {
				const name = req.rawHeaders[index] ?? "";
				const value =
					name.toLowerCase() === "host" ? base.host : req.rawHeaders[index + 1];
				lines.push(`${name}: ${value}`);
			}
			upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
			if (head.length > 0) upstream.write(head);
			socket.pipe(upstream);
			upstream.pipe(socket);
		});
		upstream.on("error", close);
		upstream.on("close", close);
		socket.on("error", close);
		socket.on("close", close);
		return true;
	};
}

/**
 * Dev-only. Vite's own `server.proxy` never sees `/api`: SvelteKit's dev
 * middleware runs first and answers 404 for paths that aren't routes. This
 * plugin answers `/api/*` itself, before SvelteKit gets to see it.
 */
export function devApiProxy(target: string): Plugin {
	return {
		name: "pleiades:dev-api-proxy",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use(createApiProxy(target));
			const upgrade = createUpgradeProxy(target);
			server.httpServer?.on("upgrade", (req, socket, head) => {
				upgrade(req, socket, head);
			});
		},
	};
}
