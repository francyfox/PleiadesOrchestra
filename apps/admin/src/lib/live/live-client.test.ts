import { describe, expect, test } from "bun:test";
import { createLiveClient, type LiveSocket, liveUrl } from "./live-client";

class FakeSocket implements LiveSocket {
	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	sent: unknown[] = [];
	closed = false;
	send(data: string) {
		this.sent.push(JSON.parse(data));
	}
	close() {
		this.closed = true;
	}
	open() {
		this.onopen?.(new Event("open"));
	}
	receive(message: unknown) {
		this.onmessage?.({
			data: typeof message === "string" ? message : JSON.stringify(message),
		} as MessageEvent);
	}
	drop() {
		this.onclose?.(new Event("close") as CloseEvent);
	}
}

function harness(visible = true) {
	const statuses: boolean[] = [];
	const sockets: FakeSocket[] = [];
	const timers = new Map<number, { fn: () => void; ms: number }>();
	let nextTimer = 1;
	let isVisible = visible;
	const visibilityListeners = new Set<() => void>();
	const client = createLiveClient({
		url: "ws://panel/api/live",
		connect: () => {
			const socket = new FakeSocket();
			sockets.push(socket);
			return socket;
		},
		isVisible: () => isVisible,
		onStatus: (up) => statuses.push(up),
		onVisibilityChange: (callback) => {
			visibilityListeners.add(callback);
			return () => visibilityListeners.delete(callback);
		},
		backoffMs: [100, 200],
		setTimer: (fn, ms) => {
			const id = nextTimer++;
			timers.set(id, { fn, ms });
			return id;
		},
		clearTimer: (id) => {
			timers.delete(id as number);
		},
	});
	const setVisible = (value: boolean) => {
		isVisible = value;
		for (const listener of [...visibilityListeners]) listener();
	};
	const fire = () => {
		const [id, timer] = [...timers.entries()][0] ?? [];
		if (id === undefined || !timer) throw new Error("no timer pending");
		timers.delete(id);
		timer.fn();
	};
	return { client, sockets, timers, setVisible, fire, statuses };
}

const handlers = () => {
	const data: unknown[] = [];
	const errors: string[] = [];
	return {
		data,
		errors,
		onData: (d: unknown) => data.push(d),
		onError: (c: string) => errors.push(c),
	};
};

const subscribes = (socket: FakeSocket) =>
	socket.sent.filter((m) => (m as { type: string }).type === "subscribe") as {
		type: string;
		id: string;
		topic: string;
		params: unknown;
	}[];

describe("liveUrl", () => {
	test("is the ws(s) twin of the panel origin", () => {
		expect(liveUrl("http://localhost:3002")).toBe(
			"ws://localhost:3002/api/live",
		);
		expect(liveUrl("https://admin.example.com")).toBe(
			"wss://admin.example.com/api/live",
		);
	});
});

describe("createLiveClient", () => {
	test("opens nothing until somebody subscribes", () => {
		const { sockets } = harness();
		expect(sockets).toHaveLength(0);
	});

	test("the first subscription opens one socket; subscribe messages go out once it is open", () => {
		const { client, sockets } = harness();
		client.subscribe("users", { limit: 10 }, handlers());
		client.subscribe("agents", {}, handlers());
		expect(sockets).toHaveLength(1);
		expect(sockets[0]?.sent).toEqual([]);
		sockets[0]?.open();
		const sent = subscribes(sockets[0] as FakeSocket);
		expect(sent.map((m) => [m.topic, m.params])).toEqual([
			["users", { limit: 10 }],
			["agents", {}],
		]);
		expect(new Set(sent.map((m) => m.id)).size).toBe(2);
	});

	test("a subscription made while the socket is open is sent at once", () => {
		const { client, sockets } = harness();
		client.subscribe("users", {}, handlers());
		sockets[0]?.open();
		client.subscribe("agents", {}, handlers());
		expect(subscribes(sockets[0] as FakeSocket).map((m) => m.topic)).toEqual([
			"users",
			"agents",
		]);
	});

	test("a hidden tab holds no socket; becoming visible opens it", () => {
		const { client, sockets, setVisible } = harness(false);
		client.subscribe("users", {}, handlers());
		expect(sockets).toHaveLength(0);
		setVisible(true);
		expect(sockets).toHaveLength(1);
	});

	test("hiding the tab closes the socket, showing it reopens and asks for the same subscriptions again", () => {
		const { client, sockets, setVisible } = harness();
		client.subscribe("users", { limit: 20 }, handlers());
		sockets[0]?.open();
		const firstId = subscribes(sockets[0] as FakeSocket)[0]?.id;
		setVisible(false);
		expect(sockets[0]?.closed).toBe(true);
		sockets[0]?.drop();
		setVisible(true);
		expect(sockets).toHaveLength(2);
		sockets[1]?.open();
		expect(subscribes(sockets[1] as FakeSocket)).toEqual([
			{
				type: "subscribe",
				id: firstId as string,
				topic: "users",
				params: { limit: 20 },
			},
		]);
	});

	test("hiding the tab does not trigger a reconnect timer", () => {
		const { client, sockets, timers, setVisible } = harness();
		client.subscribe("users", {}, handlers());
		sockets[0]?.open();
		setVisible(false);
		sockets[0]?.drop();
		expect(timers.size).toBe(0);
	});

	test("routes data and errors to the subscription they belong to", () => {
		const { client, sockets } = harness();
		const a = handlers();
		const b = handlers();
		client.subscribe("users", {}, a);
		client.subscribe("agents", {}, b);
		sockets[0]?.open();
		const [idA, idB] = subscribes(sockets[0] as FakeSocket).map((m) => m.id);
		sockets[0]?.receive({ type: "data", id: idA, data: { items: [1] } });
		sockets[0]?.receive({ type: "data", id: idB, data: { items: [2] } });
		sockets[0]?.receive({ type: "error", id: idB, code: "upstream" });
		expect(a.data).toEqual([{ items: [1] }]);
		expect(b.data).toEqual([{ items: [2] }]);
		expect(b.errors).toEqual(["upstream"]);
		expect(a.errors).toEqual([]);
	});

	test("garbage and unknown ids are ignored", () => {
		const { client, sockets } = harness();
		const h = handlers();
		client.subscribe("users", {}, h);
		sockets[0]?.open();
		sockets[0]?.receive("not json");
		sockets[0]?.receive({ type: "data", id: "nope", data: 1 });
		sockets[0]?.receive({ hello: "world" });
		expect(h.data).toEqual([]);
	});

	test("unsubscribing tells the server and stops routing; the last one closes the socket", () => {
		const { client, sockets } = harness();
		const a = handlers();
		const off = client.subscribe("users", {}, a);
		client.subscribe("agents", {}, handlers());
		sockets[0]?.open();
		const idA = subscribes(sockets[0] as FakeSocket)[0]?.id;
		off();
		expect(sockets[0]?.sent.at(-1)).toEqual({ type: "unsubscribe", id: idA });
		sockets[0]?.receive({ type: "data", id: idA, data: 1 });
		expect(a.data).toEqual([]);
		expect(sockets[0]?.closed).toBe(false);
	});

	test("with no subscriptions left the socket is closed", () => {
		const { client, sockets } = harness();
		const off = client.subscribe("users", {}, handlers());
		sockets[0]?.open();
		off();
		expect(sockets[0]?.closed).toBe(true);
	});

	test("unsubscribing twice is harmless", () => {
		const { client, sockets } = harness();
		const off = client.subscribe("users", {}, handlers());
		sockets[0]?.open();
		off();
		off();
		expect(
			sockets[0]?.sent.filter(
				(m) => (m as { type: string }).type === "unsubscribe",
			),
		).toHaveLength(1);
	});

	test("an unexpected close reconnects after the first backoff step and re-subscribes", () => {
		const { client, sockets, timers, fire } = harness();
		client.subscribe("users", {}, handlers());
		sockets[0]?.open();
		sockets[0]?.drop();
		expect([...timers.values()].map((t) => t.ms)).toEqual([100]);
		fire();
		expect(sockets).toHaveLength(2);
		sockets[1]?.open();
		expect(subscribes(sockets[1] as FakeSocket)).toHaveLength(1);
	});

	test("backoff grows across failures, is capped, and resets after a socket opened", () => {
		const { client, sockets, timers, fire } = harness();
		client.subscribe("users", {}, handlers());
		const delays: number[] = [];
		for (let i = 0; i < 3; i++) {
			sockets.at(-1)?.drop();
			delays.push(...[...timers.values()].map((t) => t.ms));
			fire();
		}
		sockets.at(-1)?.open();
		sockets.at(-1)?.drop();
		delays.push(...[...timers.values()].map((t) => t.ms));
		expect(delays).toEqual([100, 200, 200, 100]);
	});

	test("no reconnect timer when nobody is subscribed any more", () => {
		const { client, sockets, timers } = harness();
		const off = client.subscribe("users", {}, handlers());
		sockets[0]?.open();
		sockets[0]?.drop();
		expect(timers.size).toBe(1);
		off();
		expect(timers.size).toBe(0);
	});

	test("stop closes the socket and forgets every subscription", () => {
		const { client, sockets, timers } = harness();
		const h = handlers();
		client.subscribe("users", {}, h);
		sockets[0]?.open();
		client.stop();
		expect(sockets[0]?.closed).toBe(true);
		expect(timers.size).toBe(0);
	});

	test("a snapshot from a socket that was already replaced is dropped", () => {
		const { client, sockets, setVisible } = harness();
		const h = handlers();
		client.subscribe("users", {}, h);
		sockets[0]?.open();
		const id = subscribes(sockets[0] as FakeSocket)[0]?.id;
		setVisible(false);
		sockets[0]?.receive({ type: "data", id, data: "late" });
		expect(h.data).toEqual([]);
	});

	test("reports up when the socket opens and down when it drops unasked", () => {
		const { client, sockets, statuses } = harness();
		client.subscribe("agents", {}, handlers());
		expect(statuses).toEqual([]);
		sockets[0]?.open();
		expect(statuses).toEqual([true]);
		sockets[0]?.drop();
		expect(statuses).toEqual([true, false]);
	});

	test("a server that never accepts the connection counts as down too", () => {
		const { client, sockets, statuses } = harness();
		client.subscribe("agents", {}, handlers());
		sockets[0]?.drop();
		expect(statuses).toEqual([false]);
	});

	test("a close we asked for (tab hidden, nothing subscribed) reports up, not down", () => {
		const { client, sockets, statuses, setVisible } = harness();
		const off = client.subscribe("agents", {}, handlers());
		sockets[0]?.open();
		setVisible(false);
		expect(statuses).toEqual([true, true]);
		setVisible(true);
		sockets[1]?.open();
		off();
		expect(statuses.at(-1)).toBe(true);
	});

	test("a hidden tab that was down is cleared: nothing depends on the connection any more", () => {
		const { client, sockets, statuses, setVisible } = harness();
		client.subscribe("agents", {}, handlers());
		sockets[0]?.open();
		sockets[0]?.drop();
		setVisible(false);
		expect(statuses).toEqual([true, false, true]);
	});
});
