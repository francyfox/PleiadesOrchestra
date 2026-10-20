import { describe, expect, test } from "bun:test";
import { toDiagnostics } from "./toml-check";

const one = (doc: string, e: Parameters<typeof toDiagnostics>[0][number]) =>
	toDiagnostics([e], doc);

describe("toDiagnostics", () => {
	test("line and column become a one-character range", () => {
		const { diagnostics } = one("a = 1\nb = ?\n", {
			message: "bad",
			line: 2,
			column: 5,
		});
		expect(diagnostics).toEqual([
			{ from: 10, to: 11, severity: "error", message: "bad" },
		]);
	});

	test("missing column marks the whole line", () => {
		const { diagnostics } = one("ab\ncde\nf", { message: "x", line: 2 });
		expect([diagnostics[0]?.from, diagnostics[0]?.to]).toEqual([3, 6]);
	});

	test("no line, line 0 or negative go to the list", () => {
		const errors = [
			{ message: "a", path: "providers.x.base_url" },
			{ message: "b", line: 0 },
			{ message: "c", line: -3, column: 1 },
			{ message: "d", line: Number.NaN },
		];
		const r = toDiagnostics(errors, "x = 1");
		expect(r.diagnostics).toEqual([]);
		expect(r.listed).toEqual(errors);
	});

	test("empty document clamps to 0..0", () => {
		const { diagnostics } = one("", { message: "x", line: 1, column: 1 });
		expect(diagnostics[0]).toMatchObject({ from: 0, to: 0 });
		expect(one("", { message: "x", line: 9 }).diagnostics[0]).toMatchObject({
			from: 0,
			to: 0,
		});
	});

	test("last line without trailing newline", () => {
		const { diagnostics } = one("a = 1\nb = }", {
			message: "x",
			line: 2,
			column: 5,
		});
		expect(diagnostics[0]).toMatchObject({ from: 10, to: 11 });
	});

	test("line beyond the doc clamps to the end of the doc", () => {
		const { diagnostics } = one("a = 1\nb = 2", {
			message: "x",
			line: 99,
			column: 3,
		});
		expect(diagnostics[0]).toMatchObject({ from: 11, to: 11 });
	});

	test("column beyond the line end goes to the end of that line", () => {
		const { diagnostics } = one("ab\ncd", {
			message: "x",
			line: 1,
			column: 50,
		});
		expect(diagnostics[0]).toMatchObject({ from: 2, to: 2 });
	});

	test("CRLF counts as one character, like CodeMirror", () => {
		const { diagnostics } = one("a = 1\r\nb = ?\r\nc", {
			message: "x",
			line: 2,
			column: 5,
		});
		expect(diagnostics[0]).toMatchObject({ from: 10, to: 11 });
		expect(
			one("a\r\nb", { message: "x", line: 2 }).diagnostics[0],
		).toMatchObject({ from: 2, to: 3 });
	});

	test("several errors on one line stay separate", () => {
		const { diagnostics } = toDiagnostics(
			[
				{ message: "a", line: 1, column: 1 },
				{ message: "b", line: 1, column: 3 },
			],
			"x = y",
		);
		expect(diagnostics.map((d) => d.from)).toEqual([0, 2]);
	});

	test("Cyrillic and emoji before the column", () => {
		const { diagnostics } = one('имя = "😀" ?', {
			message: "x",
			line: 1,
			column: 1,
		});
		expect(diagnostics[0]).toMatchObject({ from: 0, to: 1 });
		// the emoji is two UTF-16 units: `?` sits at index 10
		const at = one('имя = "😀" ?', { message: "x", line: 1, column: 11 });
		expect(at.diagnostics[0]).toMatchObject({ from: 10, to: 11 });
	});

	test("path is prefixed to a diagnostic message and kept in the list", () => {
		const { diagnostics } = one("a", { message: "m", line: 1, path: "p.q" });
		expect(diagnostics[0]?.message).toBe("p.q: m");
		const { listed } = one("a", { message: "m", path: "p.q" });
		expect(listed).toEqual([{ message: "m", path: "p.q" }]);
	});
});
