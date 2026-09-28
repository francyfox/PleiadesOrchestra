import { describe, expect, test } from "bun:test";
import {
	createSystemStream,
	type StreamSocket,
	streamUrl,
} from "./system-stream";

class FakeSocket implements StreamSocket {
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: (() => void) | null = null;
	closed = false;
	close() {
		this.closed = true;
	}
	open() {
		this.onopen?.();
	}
	receive(data: unknown) {
		this.onmessage?.({
			data: typeof data === "string" ? data : JSON.stringify(data),
		});
	}
	drop() {
		this.onclose?.();
	}
}

function harness(backoffMs = [100, 200, 400]) {
	const sockets: FakeSocket[] = [];
	const urls: string[] = [];
	const timers = new Map<number, { fn: () => void; ms: number }>();
	let nextTimer = 1;
	const snapshots: unknown[] = [];
	const stream = createSystemStream<{ n: number }>({
		url: "ws://panel/api/system/stream",
		connect: (url) => {
			urls.push(url);
			const socket = new FakeSocket();
			sockets.push(socket);
			return socket;
		},
		onSnapshot: (snapshot) => snapshots.push(snapshot),
		backoffMs,
		setTimer: (fn, ms) => {
			const id = nextTimer++;
			timers.set(id, { fn, ms });
			return id;
		},
		clearTimer: (id) => {
			timers.delete(id as number);
		},
	});
	const fire = () => {
		const [id, timer] = [...timers.entries()][0] ?? [];
		if (id === undefined || !timer) throw new Error("no timer pending");
		timers.delete(id);
		timer.fn();
	};
	return { stream, sockets, urls, timers, snapshots, fire };
}

describe("streamUrl", () => {
	test("turns the page origin into a ws(s) URL for the stream path", () => {
		expect(streamUrl("http://localhost:3002")).toBe(
			"ws://localhost:3002/api/system/stream",
		);
		expect(streamUrl("https://admin.example.com")).toBe(
			"wss://admin.example.com/api/system/stream",
		);
	});
});

describe("createSystemStream", () => {
	test("opens nothing until started", () => {
		const { sockets } = harness();
		expect(sockets).toHaveLength(0);
	});

	test("start opens one socket, and starting twice does not open a second", () => {
		const { stream, sockets, urls } = harness();
		stream.start();
		stream.start();
		expect(sockets).toHaveLength(1);
		expect(urls).toEqual(["ws://panel/api/system/stream"]);
	});

	test("hands parsed messages to onSnapshot and ignores garbage", () => {
		const { stream, sockets, snapshots } = harness();
		stream.start();
		sockets[0]?.open();
		sockets[0]?.receive({ n: 1 });
		sockets[0]?.receive("not json");
		sockets[0]?.receive({ n: 2 });
		expect(snapshots).toEqual([{ n: 1 }, { n: 2 }]);
	});

	test("stop closes the socket and never reconnects", () => {
		const { stream, sockets, timers } = harness();
		stream.start();
		sockets[0]?.open();
		stream.stop();
		expect(sockets[0]?.closed).toBe(true);
		sockets[0]?.drop();
		expect(timers.size).toBe(0);
		expect(sockets).toHaveLength(1);
	});

	test("a snapshot arriving after stop is dropped", () => {
		const { stream, sockets, snapshots } = harness();
		stream.start();
		sockets[0]?.open();
		stream.stop();
		sockets[0]?.receive({ n: 9 });
		expect(snapshots).toEqual([]);
	});

	test("an unexpected close reconnects after the first backoff step", () => {
		const { stream, sockets, timers, fire } = harness();
		stream.start();
		sockets[0]?.open();
		sockets[0]?.drop();
		expect([...timers.values()].map((timer) => timer.ms)).toEqual([100]);
		fire();
		expect(sockets).toHaveLength(2);
	});

	test("backoff grows across failed attempts and is capped at the last step", () => {
		const { stream, sockets, timers, fire } = harness([100, 200]);
		stream.start();
		const delays: number[] = [];
		for (let attempt = 0; attempt < 3; attempt++) {
			sockets.at(-1)?.drop();
			delays.push(...[...timers.values()].map((timer) => timer.ms));
			fire();
		}
		expect(delays).toEqual([100, 200, 200]);
	});

	test("a socket that opened resets the backoff", () => {
		const { stream, sockets, timers, fire } = harness([100, 200]);
		stream.start();
		sockets[0]?.drop();
		fire();
		sockets[1]?.open();
		sockets[1]?.drop();
		expect([...timers.values()].map((timer) => timer.ms)).toEqual([100]);
	});

	test("stop cancels a pending reconnect", () => {
		const { stream, sockets, timers } = harness();
		stream.start();
		sockets[0]?.drop();
		expect(timers.size).toBe(1);
		stream.stop();
		expect(timers.size).toBe(0);
	});

	test("can be started again after stop (tab became visible)", () => {
		const { stream, sockets } = harness();
		stream.start();
		stream.stop();
		stream.start();
		expect(sockets).toHaveLength(2);
		expect(sockets[1]?.closed).toBe(false);
	});

	test("reports up on open, down on an unexpected close, up again on stop", () => {
		const statuses: boolean[] = [];
		const sockets: FakeSocket[] = [];
		const stream = createSystemStream<{ n: number }>({
			url: "ws://panel/api/system/stream",
			connect: () => {
				const socket = new FakeSocket();
				sockets.push(socket);
				return socket;
			},
			onSnapshot: () => {},
			onStatus: (up) => statuses.push(up),
			setTimer: () => 1,
			clearTimer: () => {},
		});
		stream.start();
		sockets[0]?.open();
		sockets[0]?.drop();
		expect(statuses).toEqual([true, false]);
		stream.stop();
		expect(statuses).toEqual([true, false, true]);
	});
});
