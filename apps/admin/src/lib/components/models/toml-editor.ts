import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
	HighlightStyle,
	StreamLanguage,
	syntaxHighlighting,
} from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { TomlDiagnostic } from "#lib/toml-check.js";

/** Loaded with a dynamic `import()` when the dialog opens, so CodeMirror stays out of the main bundle. */
const theme = EditorView.theme({
	"&": {
		color: "var(--foreground)",
		backgroundColor: "var(--background)",
		border: "1px solid var(--border)",
		borderRadius: "var(--radius)",
		height: "min(60vh, 28rem)",
		fontSize: "0.75rem",
	},
	"&.cm-focused": { outline: "2px solid var(--ring)" },
	".cm-scroller": { fontFamily: "var(--font-mono)", overflow: "auto" },
	".cm-gutters": {
		backgroundColor: "var(--muted)",
		color: "var(--muted-foreground)",
		border: "none",
	},
	".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
	// Without drawSelection the native caret shows; the base theme's `&light .cm-content` makes it black (same specificity here, the theme wins).
	"&.cm-editor .cm-content": { caretColor: "var(--foreground)" },
	".cm-cursor": { borderLeftColor: "var(--foreground)" },
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
		backgroundColor: "var(--accent)",
	},
	".cm-tooltip": {
		backgroundColor: "var(--popover)",
		color: "var(--popover-foreground)",
		border: "1px solid var(--border)",
	},
});

const highlight = HighlightStyle.define([
	{ tag: t.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
	{ tag: [t.string, t.number, t.atom], color: "var(--primary)" },
	{ tag: [t.heading, t.keyword], color: "var(--primary)", fontWeight: "bold" },
	{ tag: t.propertyName, color: "var(--foreground)" },
]);

export interface TomlEditor {
	text: () => string;
	/** Replaces all markers; an empty list clears them. */
	mark: (diagnostics: TomlDiagnostic[]) => void;
	destroy: () => void;
}

export function createTomlEditor(
	parent: HTMLElement,
	opts: {
		doc: string;
		label: string;
		onChange: (text: string) => void;
		onCheck: () => void;
	},
): TomlEditor {
	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc: opts.doc,
			extensions: [
				lineNumbers(),
				lintGutter(),
				history(),
				StreamLanguage.define(toml),
				syntaxHighlighting(highlight),
				theme,
				EditorView.contentAttributes.of({ "aria-label": opts.label }),
				EditorView.updateListener.of((u) => {
					if (u.docChanged) opts.onChange(u.state.doc.toString());
				}),
				// No indentWithTab: Tab leaves the editor, so keyboard users are never trapped.
				keymap.of([
					{
						key: "Alt-Shift-l",
						preventDefault: true,
						run: () => {
							opts.onCheck();
							return true;
						},
					},
					...defaultKeymap,
					...historyKeymap,
				]),
			],
		}),
	});
	return {
		text: () => view.state.doc.toString(),
		mark: (diagnostics) =>
			view.dispatch(setDiagnostics(view.state, diagnostics)),
		destroy: () => view.destroy(),
	};
}
