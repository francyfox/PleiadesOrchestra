import type { AnyWindow } from "./types.ts";

/** `:tool-form-active` -> `.tool-form-active`; null when nothing changed. */
export function rewritePseudoClasses(text: string): string | null {
	const out = text
		.replace(/:tool-form-active/g, ".tool-form-active")
		.replace(/:tool-submit-active/g, ".tool-submit-active");
	return out !== text ? out : null;
}

function appendStyle(w: AnyWindow, css: string): void {
	const el = w.document.createElement("style");
	el.textContent = css;
	w.document.head.appendChild(el);
}

function inlineSheetRules(sheet: CSSStyleSheet): string[] {
	const out: string[] = [];
	try {
		for (const rule of Array.from(sheet.cssRules ?? [])) {
			const css = rewritePseudoClasses(rule.cssText);
			if (css) out.push(css);
		}
	} catch {
		/* cross-origin */
	}
	return out;
}

function polyfillLinkedSheet(w: AnyWindow, href: string): void {
	fetch(href)
		.then((r) => r.text())
		.then((text) => {
			const css = rewritePseudoClasses(text);
			if (css) appendStyle(w, css);
		})
		.catch(() => {
			/* ignore */
		});
}

function styleTagRules(w: AnyWindow): string[] {
	const out: string[] = [];
	for (const tag of Array.from(w.document.querySelectorAll("style"))) {
		const css = rewritePseudoClasses(tag.textContent ?? "");
		if (css) out.push(css);
	}
	return out;
}

/** Rewrites the not-yet-standard `:tool-*-active` pseudo-classes into classes. */
export function polyfillCSSPseudoClasses(w: AnyWindow): void {
	const styles: string[] = [];
	for (const sheet of Array.from(w.document.styleSheets)) {
		if (sheet.href) polyfillLinkedSheet(w, sheet.href);
		else styles.push(...inlineSheetRules(sheet));
	}
	styles.push(...styleTagRules(w));
	if (styles.length > 0) appendStyle(w, styles.join("\n"));
}

/** Runs the pseudo-class polyfill now, or once the DOM has loaded. */
export function schedulePseudoClassPolyfill(w: AnyWindow): void {
	if (w.document.readyState === "loading")
		w.document.addEventListener("DOMContentLoaded", () =>
			polyfillCSSPseudoClasses(w),
		);
	else polyfillCSSPseudoClasses(w);
}
