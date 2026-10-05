import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureModel, MODEL_FILES } from "./translate-engine.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "model-"));

describe("ensureModel", () => {
	test("downloads every file of the model that is missing, from the repo's main branch", async () => {
		const dir = tmp();
		const urls: string[] = [];

		await ensureModel(dir, "org/model", async (url) => {
			urls.push(url);
			return new Response(`bytes of ${url.split("/").at(-1)}`);
		});

		expect(urls).toEqual(
			MODEL_FILES.map(
				(name) => `https://huggingface.co/org/model/resolve/main/${name}`,
			),
		);
		for (const name of MODEL_FILES) {
			expect(readFileSync(join(dir, name), "utf8")).toBe(`bytes of ${name}`);
			expect(existsSync(join(dir, `${name}.part`))).toBe(false);
		}
	});

	test("what is already there is not fetched again", async () => {
		const dir = tmp();
		writeFileSync(join(dir, "model.bin"), "kept");
		const urls: string[] = [];

		await ensureModel(dir, "org/model", async (url) => {
			urls.push(url);
			return new Response("x");
		});

		expect(readFileSync(join(dir, "model.bin"), "utf8")).toBe("kept");
		expect(urls.some((url) => url.endsWith("/model.bin"))).toBe(false);
		expect(urls).toHaveLength(MODEL_FILES.length - 1);
	});

	test("a refused download throws and leaves no half file that would pass for the model", async () => {
		const dir = tmp();

		await expect(
			ensureModel(
				dir,
				"org/model",
				async () => new Response("no", { status: 404 }),
			),
		).rejects.toThrow("404");

		expect(existsSync(join(dir, "model.bin"))).toBe(false);
	});

	test("a download cut off half way leaves nothing that passes for the file", async () => {
		const dir = tmp();
		const cut = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("half"));
				controller.error(new Error("connection reset"));
			},
		});

		await expect(
			ensureModel(dir, "org/model", async () => new Response(cut)),
		).rejects.toThrow("connection reset");

		expect(existsSync(join(dir, "model.bin"))).toBe(false);
		expect(existsSync(join(dir, "model.bin.part"))).toBe(false);
	});
});
