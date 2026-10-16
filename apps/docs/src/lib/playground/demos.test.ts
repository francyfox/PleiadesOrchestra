import { expect, test } from "bun:test";
import { demoChannel, demos } from "./demos.ts";

const pizza = demos.find((d) => d.env === "PIZZA_MAKER");
if (!pizza) throw new Error("fixture demo missing");

test("a demo with its own key uses it", () => {
	const env = {
		PUBLIC_PLEIADES_KEY: "pk_shared",
		PUBLIC_PLEIADES_KEY_PIZZA_MAKER: "pk_pizza",
	};
	expect(demoChannel(env, pizza)).toEqual({ key: "pk_pizza", own: true });
});

test("a demo without its own key falls back to the shared one", () => {
	const env = {
		PUBLIC_PLEIADES_KEY: "pk_shared",
		PUBLIC_PLEIADES_KEY_PIZZA_MAKER: " ",
	};
	expect(demoChannel(env, pizza)).toEqual({ key: "pk_shared", own: false });
});

test("no keys at all gives an empty fallback", () => {
	expect(demoChannel({}, pizza)).toEqual({ key: "", own: false });
});
