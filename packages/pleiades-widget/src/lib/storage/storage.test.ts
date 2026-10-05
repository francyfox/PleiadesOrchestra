import { describe, expect, test } from "bun:test";
import { createSessionStore } from "@/lib/storage/storage.ts";

function memoryStorage(): Storage {
	const data = new Map<string, string>();
	return {
		get length() {
			return data.size;
		},
		clear: () => data.clear(),
		getItem: (key) => data.get(key) ?? null,
		key: (index) => [...data.keys()][index] ?? null,
		removeItem: (key) => void data.delete(key),
		setItem: (key, value) => void data.set(key, value),
	};
}

const scope = {
	agentUrl: "https://agent.example.com",
	publishableKey: "pk_abcdefghijklmnop",
};

describe("createSessionStore", () => {
	test("starts empty", () => {
		expect(
			createSessionStore({ ...scope, storage: memoryStorage() }).load(0),
		).toEqual({});
	});

	test("remembers the visitor token and thread", () => {
		const storage = memoryStorage();
		createSessionStore({ ...scope, storage }).save({
			visitorToken: "tok",
			expiresAt: 1000,
			threadId: "t1",
		});
		expect(createSessionStore({ ...scope, storage }).load(500)).toEqual({
			visitorToken: "tok",
			expiresAt: 1000,
			threadId: "t1",
		});
	});

	test("save merges into what is already stored", () => {
		const store = createSessionStore({ ...scope, storage: memoryStorage() });
		store.save({ visitorToken: "tok", expiresAt: 1000 });
		store.save({ threadId: "t1" });
		expect(store.load(0)).toEqual({
			visitorToken: "tok",
			expiresAt: 1000,
			threadId: "t1",
		});
	});

	test("an expired token (and the thread that belonged to it) is dropped", () => {
		const store = createSessionStore({ ...scope, storage: memoryStorage() });
		store.save({ visitorToken: "tok", expiresAt: 1000, threadId: "t1" });
		expect(store.load(1000)).toEqual({});
		expect(store.load(2000)).toEqual({});
	});

	test("different sites/keys never share a session", () => {
		const storage = memoryStorage();
		createSessionStore({ ...scope, storage }).save({
			visitorToken: "a",
			expiresAt: 9999,
		});
		const other = createSessionStore({
			...scope,
			publishableKey: "pk_zzzzzzzzzzzzzzzz",
			storage,
		});
		expect(other.load(0)).toEqual({});
	});

	test("clear forgets everything", () => {
		const store = createSessionStore({ ...scope, storage: memoryStorage() });
		store.save({ visitorToken: "tok", expiresAt: 1000, threadId: "t1" });
		store.clear();
		expect(store.load(0)).toEqual({});
	});

	test("corrupt stored data is ignored, not thrown", () => {
		const storage = memoryStorage();
		const store = createSessionStore({ ...scope, storage });
		store.save({ visitorToken: "tok", expiresAt: 1000 });
		const [key] = [...Array(storage.length).keys()].map(
			(i) => storage.key(i) as string,
		);
		storage.setItem(key as string, "{not json");
		expect(store.load(0)).toEqual({});
	});

	test("storage that throws (blocked cookies, private mode) falls back to memory", () => {
		const broken = {
			getItem() {
				throw new DOMException("denied", "SecurityError");
			},
			setItem() {
				throw new DOMException("denied", "SecurityError");
			},
			removeItem() {
				throw new DOMException("denied", "SecurityError");
			},
		} as unknown as Storage;
		const store = createSessionStore({ ...scope, storage: broken });
		store.save({ visitorToken: "tok", expiresAt: 1000 });
		expect(store.load(0)).toEqual({ visitorToken: "tok", expiresAt: 1000 });
	});

	describe("tool mode", () => {
		test("starts unset", () => {
			expect(
				createSessionStore({
					...scope,
					storage: memoryStorage(),
				}).loadToolMode(),
			).toBeUndefined();
		});

		test("remembers the chosen mode across instances", () => {
			const storage = memoryStorage();
			createSessionStore({ ...scope, storage }).saveToolMode("mcp");
			expect(createSessionStore({ ...scope, storage }).loadToolMode()).toBe(
				"mcp",
			);
		});

		test("survives the visitor token expiring — a UI preference, not session state", () => {
			const storage = memoryStorage();
			const store = createSessionStore({ ...scope, storage });
			store.save({ visitorToken: "tok", expiresAt: 1000 });
			store.saveToolMode("mcp");
			expect(store.load(2000)).toEqual({});
			expect(store.loadToolMode()).toBe("mcp");
		});

		test("garbage in the mode key is ignored, not thrown", () => {
			const storage = memoryStorage();
			storage.setItem(
				"pleiades-widget:https://agent.example.com:pk_abcdefghijklmnop:mode",
				"nonsense",
			);
			expect(
				createSessionStore({ ...scope, storage }).loadToolMode(),
			).toBeUndefined();
		});
	});
});
