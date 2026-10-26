import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resultPath } from "./report.service.ts";

test("default path: results/<bench>/<timestamp>.<ext>, file-name safe; --output wins", () => {
	const root = mkdtempSync(join(tmpdir(), "bench-"));
	const now = new Date("2026-10-26T10:15:00.123Z");
	expect(resultPath("tools", "json", undefined, { now, root })).toBe(
		join(root, "tools", "2026-10-26T10-15-00.json"),
	);
	expect(Bun.file(join(root, "tools")).size).toBeDefined();
	expect(resultPath("tools", "json", "x/y.json", { now, root })).toBe(
		"x/y.json",
	);
});
