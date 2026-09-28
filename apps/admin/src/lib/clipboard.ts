export interface ClipboardLike {
	writeText(text: string): Promise<void>;
}

/** Copies `text`; never throws — `false` means the browser refused or has no clipboard (plain-http origins). */
export async function copyText(
	text: string,
	clipboard: ClipboardLike | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
	if (!clipboard) return false;
	try {
		await clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
