import { describe, expect, test } from "bun:test";
import { createDictation, speechLang } from "./speech.ts";

/** A stand-in for the browser's SpeechRecognition that tests drive by hand. */
class FakeRecognition {
	static last: FakeRecognition;
	lang = "";
	interimResults = false;
	continuous = true;
	started = 0;
	stopped = 0;
	onresult: ((event: unknown) => void) | null = null;
	onend: (() => void) | null = null;
	onerror: ((event: { error: string }) => void) | null = null;
	constructor() {
		FakeRecognition.last = this;
	}
	start() {
		this.started++;
	}
	stop() {
		this.stopped++;
		this.onend?.();
	}
	say(...parts: string[]) {
		this.onresult?.({ results: parts.map((transcript) => [{ transcript }]) });
	}
}
const ctor = FakeRecognition as unknown as new () => never;

describe("speechLang", () => {
	test("maps the widget's languages to recognition locales", () => {
		expect(speechLang("en")).toBe("en-US");
		expect(speechLang("ru")).toBe("ru-RU");
		expect(speechLang("kk")).toBe("kk-KZ");
	});
});

describe("createDictation", () => {
	test("there is no dictation where the browser has no recognition", () => {
		expect(createDictation("ru-RU", null)).toBeUndefined();
	});

	test("it listens for one phrase in the given language and reports the text so far", () => {
		const texts: string[] = [];
		const dictation = createDictation("ru-RU", ctor);
		dictation?.start({ onText: (t) => texts.push(t), onEnd: () => {} });
		const recognition = FakeRecognition.last;
		expect(recognition.lang).toBe("ru-RU");
		expect(recognition.interimResults).toBe(true);
		expect(recognition.continuous).toBe(false);
		expect(recognition.started).toBe(1);
		recognition.say("привет");
		recognition.say("привет", " мир");
		expect(texts).toEqual(["привет", "привет мир"]);
	});

	test("the end of listening is reported once, without an error when all went well", () => {
		const ends: (string | undefined)[] = [];
		createDictation("en-US", ctor)?.start({
			onText: () => {},
			onEnd: (error) => ends.push(error),
		});
		FakeRecognition.last.onend?.();
		expect(ends).toEqual([undefined]);
	});

	test("an error is reported with its code, and the end after it adds nothing", () => {
		const ends: (string | undefined)[] = [];
		createDictation("en-US", ctor)?.start({
			onText: () => {},
			onEnd: (error) => ends.push(error),
		});
		FakeRecognition.last.onerror?.({ error: "not-allowed" });
		FakeRecognition.last.onend?.();
		expect(ends).toEqual(["not-allowed"]);
	});

	test("stop asks the recognizer to stop", () => {
		const dictation = createDictation("en-US", ctor);
		dictation?.start({ onText: () => {}, onEnd: () => {} });
		dictation?.stop();
		expect(FakeRecognition.last.stopped).toBe(1);
	});
});
