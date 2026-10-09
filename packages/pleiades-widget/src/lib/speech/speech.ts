import type { Lang } from "@/lib/i18n/i18n.ts";

/** What the widget needs of speech-to-text: listen for a phrase, report the text so far, stop. */
export interface Dictation {
	start(handlers: {
		/** The whole phrase recognized so far (it grows and may be corrected while the person speaks). */
		onText: (text: string) => void;
		/** Listening is over; `error` is the browser's code (`not-allowed`, `no-speech`, …) when it ended badly. */
		onEnd: (error?: string) => void;
	}): void;
	stop(): void;
}

/** The slice of the browser's `SpeechRecognition` used here. */
interface Recognition {
	lang: string;
	interimResults: boolean;
	continuous: boolean;
	onresult:
		| ((event: {
				results: ArrayLike<ArrayLike<{ transcript: string }>>;
		  }) => void)
		| null;
	onend: (() => void) | null;
	onerror: ((event: { error: string }) => void) | null;
	start(): void;
	stop(): void;
}
type RecognitionCtor = new () => Recognition;

const LOCALES: Record<Lang, string> = {
	en: "en-US",
	ru: "ru-RU",
	kk: "kk-KZ",
};

export const speechLang = (lang: Lang): string => LOCALES[lang];

/** The browser's recognizer: standard in Safari/Chrome-based browsers under a `webkit` prefix, behind a flag in Firefox. */
function browserRecognition(): RecognitionCtor | null {
	const host = globalThis as {
		SpeechRecognition?: RecognitionCtor;
		webkitSpeechRecognition?: RecognitionCtor;
	};
	return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

/**
 * Dictation through the browser's Web Speech API, or `undefined` where there
 * is none (then the widget shows no microphone). Chrome and Safari send the
 * audio to Google's / Apple's servers to recognize it.
 */
export function createDictation(
	locale: string,
	ctor: RecognitionCtor | null = browserRecognition(),
): Dictation | undefined {
	if (!ctor) return undefined;
	let recognition: Recognition | undefined;
	return {
		start({ onText, onEnd }) {
			recognition = new ctor();
			recognition.lang = locale;
			recognition.interimResults = true;
			// One phrase per press: it ends by itself on a pause, so the microphone never stays on by accident.
			recognition.continuous = false;
			let error: string | undefined;
			let ended = false;
			recognition.onresult = (event) => {
				onText(
					Array.from(
						event.results,
						(result) => result[0]?.transcript ?? "",
					).join(""),
				);
			};
			recognition.onerror = (event) => {
				error = event.error;
			};
			recognition.onend = () => {
				if (ended) return;
				ended = true;
				onEnd(error);
			};
			recognition.start();
		},
		stop() {
			recognition?.stop();
		},
	};
}
