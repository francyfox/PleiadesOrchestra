import { dlopen, FFIType, ptr } from "bun:ffi";
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { NativeCalls } from "./translate.service.ts";

/** Files of a CTranslate2 Opus-MT model directory (`model.bin` + vocabulary + the two SentencePiece models). */
export const MODEL_FILES = [
	"model.bin",
	"config.json",
	"shared_vocabulary.json",
	"source.spm",
	"target.spm",
] as const;

type Fetch = (url: string) => Promise<Response>;

/**
 * Downloads whatever of the model is missing into `dir` (once; it lives on a
 * volume afterwards). Each file goes to `<name>.part` and is renamed when
 * complete, so a download cut short never looks like a finished model.
 */
export async function ensureModel(
	dir: string,
	repo: string,
	fetchImpl: Fetch = fetch,
): Promise<void> {
	mkdirSync(dir, { recursive: true });
	for (const name of MODEL_FILES) {
		const target = join(dir, name);
		if (existsSync(target)) continue;
		const response = await fetchImpl(
			`https://huggingface.co/${repo}/resolve/main/${name}`,
		);
		if (!response.ok) {
			throw new Error(
				`model file ${name}: ${response.status} ${response.statusText}`,
			);
		}
		if (!response.body) throw new Error(`model file ${name}: empty answer`);
		// Streamed to disk by hand: `Bun.write(path, response)` hangs under musl
		// (the Alpine image) — it never created the file; found 2026-10-02.
		const part = `${target}.part`;
		try {
			await pipeline(
				Readable.fromWeb(response.body as never),
				createWriteStream(part),
			);
		} catch (error) {
			rmSync(part, { force: true });
			throw error;
		}
		renameSync(part, target);
	}
}

export interface EngineOptions {
	libPath: string;
	modelDir: string;
	threads: number;
	computeType: string;
}

const cstr = (text: string) => new TextEncoder().encode(`${text}\0`);
const BEAM = 2;
const MAX_TOKENS = 64;

/**
 * Loads `libtranslator.so` (native/translator.cpp) and one Opus-MT model into
 * it. Throws when the library or the model can't be loaded — the caller
 * (`translate.instance.ts`) turns that into "no translation".
 */
export function loadEngine(options: EngineOptions): NativeCalls {
	const lib = dlopen(options.libPath, {
		tr_create: {
			args: [
				FFIType.ptr, // model dir
				FFIType.ptr, // source.spm
				FFIType.ptr, // target.spm
				FFIType.i32, // threads
				FFIType.ptr, // compute type
				FFIType.ptr, // error buffer
				FFIType.i32,
			],
			returns: FFIType.ptr,
		},
		tr_translate: {
			args: [
				FFIType.ptr,
				FFIType.ptr,
				FFIType.i32,
				FFIType.i32,
				FFIType.ptr,
				FFIType.i32,
			],
			returns: FFIType.i32,
		},
		tr_free: { args: [FFIType.ptr], returns: FFIType.void },
	});

	const error = new Uint8Array(512);
	const handle = lib.symbols.tr_create(
		ptr(cstr(options.modelDir)),
		ptr(cstr(join(options.modelDir, "source.spm"))),
		ptr(cstr(join(options.modelDir, "target.spm"))),
		options.threads,
		ptr(cstr(options.computeType)),
		ptr(error),
		error.length,
	);
	if (!handle) {
		const end = error.indexOf(0);
		throw new Error(
			`translator: ${new TextDecoder().decode(error.subarray(0, end === -1 ? 0 : end)) || "could not load the model"}`,
		);
	}

	return {
		call: (text, out) =>
			lib.symbols.tr_translate(
				handle,
				ptr(text),
				BEAM,
				MAX_TOKENS,
				ptr(out),
				out.length,
			),
		free: () => {
			lib.symbols.tr_free(handle);
			lib.close();
		},
	};
}
