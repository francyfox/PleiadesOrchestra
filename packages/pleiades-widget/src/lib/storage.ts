export interface StoredSession {
	visitorToken?: string;
	expiresAt?: number;
	threadId?: string;
}

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
	};
}

export type SessionStore = ReturnType<typeof createSessionStore>;
