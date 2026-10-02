export interface StoredSession {
	visitorToken?: string;
	expiresAt?: number;
	threadId?: string;
}

/** WebMCP: the browser exposes the host page's own tools directly (`navigator.modelContext`) — needs a recent Chrome. MCP: the site's tools are reached through a server-side MCP connection instead, no browser support required. */
export type ToolMode = "webmcp" | "mcp";

interface StoreOptions {
	agentUrl: string;
	publishableKey: string;
	/** Defaults to `localStorage`; unavailable/blocked storage falls back to memory. */
	storage?: Storage;
}

function defaultStorage(): Storage | undefined {
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
}

/**
 * The visitor token and thread id, remembered per (agent, key) so a page
 * reload continues the conversation and two sites never share a session.
 * The publishable key itself is not stored, only used to name the entry.
 */
export function createSessionStore({
	agentUrl,
	publishableKey,
	storage = defaultStorage(),
}: StoreOptions) {
	const name = `pleiades-widget:${agentUrl}:${publishableKey}`;
	// Separate key, deliberately not part of `StoredSession`: a UI preference
	// must survive the visitor token expiring, not be wiped along with it.
	const modeKey = `${name}:mode`;
	let memory: StoredSession = {};
	let usable = storage !== undefined;

	function read(): StoredSession {
		if (usable && storage) {
			try {
				const raw = storage.getItem(name);
				if (raw === null) return {};
				const parsed: unknown = JSON.parse(raw);
				return parsed !== null && typeof parsed === "object"
					? (parsed as StoredSession)
					: {};
			} catch (cause) {
				if (cause instanceof SyntaxError) return {};
				usable = false;
			}
		}
		return memory;
	}

	function write(value: StoredSession) {
		memory = value;
		if (usable && storage) {
			try {
				storage.setItem(name, JSON.stringify(value));
			} catch {
				usable = false;
			}
		}
	}

	return {
		/** The stored session, or `{}` when there is none or its token has expired. */
		load(now: number): StoredSession {
			const stored = read();
			if (stored.expiresAt === undefined || stored.expiresAt <= now) return {};
			return stored;
		},
		save(patch: StoredSession) {
			write({ ...read(), ...patch });
		},
		clear() {
			memory = {};
			if (usable && storage) {
				try {
					storage.removeItem(name);
				} catch {
					usable = false;
				}
			}
		},
		loadToolMode(): ToolMode | undefined {
			if (!usable || !storage) return undefined;
			try {
				const raw = storage.getItem(modeKey);
				return raw === "webmcp" || raw === "mcp" ? raw : undefined;
			} catch {
				return undefined;
			}
		},
		saveToolMode(mode: ToolMode) {
			if (!usable || !storage) return;
			try {
				storage.setItem(modeKey, mode);
			} catch {
				// Best-effort — a lost preference just falls back to the default next time.
			}
		},
	};
}

export type SessionStore = ReturnType<typeof createSessionStore>;
