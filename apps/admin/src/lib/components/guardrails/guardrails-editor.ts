import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { forceLinting, linter, lintGutter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { type RuleLineError, ruleErrors } from "#lib/guardrails-rules.js";
import { toDiagnostics } from "#lib/toml-check.js";
import { editorTheme } from "../code-editor-theme.js";

/**
 * Plain-text editor of the guardrail rules (one regex per line), loaded with a dynamic `import()` when the dialog opens.
 * shortcut: CodeMirror virtualizes what it draws but keeps the whole text in memory (no chunked loading); fine for hundreds of lines (the limit is 500 rules), upgrade only if the list grows to tens of thousands.
 */
export interface GuardrailsEditor {
	text: () => string;
	/** Replaces the whole text (Reset to defaults). */
	replace: (doc: string) => void;
	/** The server's per-line errors; they go away with the next edit. */
	mark: (errors: RuleLineError[]) => void;
	destroy: () => void;
}

export function createGuardrailsEditor(
	parent: HTMLElement,
	opts: { doc: string; label: string; onChange: (text: string) => void },
): GuardrailsEditor {
	let fromServer: RuleLineError[] = [];
	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc: opts.doc,
			extensions: [
				lineNumbers(),
				lintGutter(),
				history(),
				editorTheme,
				linter(
					(v) => {
						const doc = v.state.doc.toString();
						const client = ruleErrors(doc);
						const seen = new Set(client.map((e) => e.line));
						return toDiagnostics(
							[...client, ...fromServer.filter((e) => !seen.has(e.line))],
							doc,
						).diagnostics;
					},
					{ delay: 300 },
				),
				EditorView.contentAttributes.of({ "aria-label": opts.label }),
				EditorView.updateListener.of((u) => {
					if (!u.docChanged) return;
					fromServer = [];
					opts.onChange(u.state.doc.toString());
				}),
				// No indentWithTab: Tab leaves the editor, so keyboard users are never trapped.
				keymap.of([...defaultKeymap, ...historyKeymap]),
			],
		}),
	});
	return {
		text: () => view.state.doc.toString(),
		replace: (doc) =>
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: doc },
			}),
		mark: (errors) => {
			fromServer = errors;
			forceLinting(view);
		},
		destroy: () => view.destroy(),
	};
}
