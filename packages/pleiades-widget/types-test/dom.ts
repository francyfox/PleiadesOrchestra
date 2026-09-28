// Compiled by `bun run check-types`: the shipped types must accept the real API and refuse misuse.
import type { PleiadesChat } from "../src/element";
import type { PleiadesChatElement } from "../types";

const element = document.createElement("pleiades-chat");
const typed: PleiadesChatElement = element;
typed.position = "top-left";
typed.open = true;
typed.toggle();
const token: Promise<string | undefined> = typed.getVisitorToken();
const found: PleiadesChatElement | null =
	document.querySelector("pleiades-chat");

// @ts-expect-error not part of the element
typed.nope();

// The shipped interface must stay in sync with the class that implements it.
const implementation = null as unknown as PleiadesChat;
const asPublished: PleiadesChatElement = implementation;

export { asPublished, found, token };
