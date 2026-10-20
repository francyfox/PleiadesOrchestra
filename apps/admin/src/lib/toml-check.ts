/** One entry of the server's `POST /api/providers-toml/check` answer. */
export interface TomlCheckError {
	message: string;
	line?: number;
	column?: number;
	path?: string;
}

export interface TomlDiagnostic {
	from: number;
	to: number;
	severity: "error";
	message: string;
}

const validPos = (n: unknown): n is number =>
	typeof n === "number" && Number.isInteger(n) && n >= 1;

const withPath = (e: TomlCheckError) =>
	e.path ? `${e.path}: ${e.message}` : e.message;

/**
 * Splits server errors into editor diagnostics (those with a usable line) and
 * a plain list (the rest). Offsets are UTF-16 units over `doc` with every line
 * break (LF, CRLF, CR) counted as one character, the way CodeMirror stores text.
 * shortcut: columns are taken as UTF-16 units, upgrade if the server counts code points.
 */
export function toDiagnostics(
	errors: TomlCheckError[],
	doc: string,
): { diagnostics: TomlDiagnostic[]; listed: TomlCheckError[] } {
	const lines = doc.split(/\r\n|\r|\n/);
	const starts: number[] = [];
	let offset = 0;
	for (const line of lines) {
		starts.push(offset);
		offset += line.length + 1;
	}
	const docEnd = offset - 1;
	const diagnostics: TomlDiagnostic[] = [];
	const listed: TomlCheckError[] = [];
	for (const e of errors) {
		if (!validPos(e.line)) {
			listed.push(e);
			continue;
		}
		const message = withPath(e);
		if (e.line > lines.length) {
			diagnostics.push({
				from: docEnd,
				to: docEnd,
				severity: "error",
				message,
			});
			continue;
		}
		const start = starts[e.line - 1] as number;
		const end = start + (lines[e.line - 1] as string).length;
		if (!validPos(e.column)) {
			diagnostics.push({ from: start, to: end, severity: "error", message });
			continue;
		}
		const at = Math.min(start + e.column - 1, end);
		diagnostics.push({
			from: at,
			to: at < end ? at + 1 : at,
			severity: "error",
			message,
		});
	}
	return { diagnostics, listed };
}
