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
import { editorTheme } from "../code-editor-theme.js";

/** Loaded with a dynamic `import()` when the dialog opens, so CodeMirror stays out of the main bundle. */
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
				editorTheme,
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
