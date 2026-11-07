import { EditorView } from "@codemirror/view";

/** The panel's CodeMirror look (shared by the providers.toml and guardrail editors). Imported only from lazily loaded editor chunks. */
export const editorTheme = EditorView.theme({
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
