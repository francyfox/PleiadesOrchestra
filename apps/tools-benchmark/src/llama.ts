import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Candidate } from "./models.ts";

/** Same build as production beta-text (llama.cpp b11176, Vulkan), so the numbers carry over. */
const IMAGE = "pleiades-orchestra-beta-text:latest";
const MODELS_DIR = join(homedir(), ".cache", "pleiades-tools-benchmark");
const PORT = 8290;

async function run(command: string[]): Promise<{ ok: boolean; out: string }> {
	const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
	const [out, err] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { ok: (await proc.exited) === 0, out: out + err };
}

/** Downloads the model once (resumable); returns its path inside `MODELS_DIR`. */
export async function ensureModel(candidate: Candidate): Promise<string> {
	mkdirSync(MODELS_DIR, { recursive: true });
	const path = join(MODELS_DIR, candidate.file);
	if (existsSync(path)) return path;
	const url = `https://huggingface.co/${candidate.repo}/resolve/main/${candidate.file}`;
	console.error(`downloading ${candidate.file} …`);
	const partial = `${path}.part`;
	const result = await run([
		"curl",
		"-fL",
		"--retry",
		"10",
		"--retry-all-errors",
		"-C",
		"-",
		url,
		"-o",
		partial,
	]);
	if (!result.ok) throw new Error(`download failed: ${result.out}`);
	await run(["mv", partial, path]);
	return path;
}

export interface Server {
	baseUrl: string;
	stop(): Promise<void>;
}

export interface ServerOptions {
	/** Layers on the iGPU (Vulkan); 0 = CPU only. */
	gpuLayers: number;
	threads: number;
	contextSize: number;
}

/** Starts llama-server for the model in a container and waits until it answers. */
export async function startServer(
	candidate: Candidate,
	options: ServerOptions,
): Promise<Server> {
	await ensureModel(candidate);
	const name = `tools-bench-${candidate.id}`;
	await run(["docker", "rm", "-f", name]);
	const started = await run([
		"docker",
		"run",
		"-d",
		"--rm",
		"--name",
		name,
		"--device",
		"/dev/dri",
		"--group-add",
		"989",
		"--group-add",
		"985",
		"-v",
		`${MODELS_DIR}:/models:ro`,
		"-p",
		`127.0.0.1:${PORT}:8080`,
		"--entrypoint",
		"/app/llama-server",
		IMAGE,
		"--model",
		`/models/${candidate.file}`,
		"--host",
		"0.0.0.0",
		"--port",
		"8080",
		"--ctx-size",
		String(options.contextSize),
		"--parallel",
		"1",
		"--threads",
		String(options.threads),
		"--n-gpu-layers",
		String(options.gpuLayers),
		"--jinja",
		"--temp",
		"0",
	]);
	if (!started.ok) throw new Error(`docker run failed: ${started.out}`);

	const baseUrl = `http://127.0.0.1:${PORT}`;
	const stop = async () => {
		await run(["docker", "stop", "-t", "2", name]);
	};
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/health`, {
				signal: AbortSignal.timeout(2000),
			});
			if (response.ok) return { baseUrl, stop };
		} catch {
			// not up yet
		}
		await Bun.sleep(500);
	}
	const logs = await run(["docker", "logs", "--tail", "30", name]);
	await stop();
	throw new Error(`llama-server did not become healthy:\n${logs.out}`);
}
