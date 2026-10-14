import { expect, test } from "bun:test";
import { DELTA_MODEL, modelUrl } from "./models.ts";

test("measures the model delta runs in production (its Dockerfile's MODEL_URL)", async () => {
	const dockerfile = await Bun.file(
		new URL("../../../delta-function-call/Dockerfile", import.meta.url),
	).text();
	const production = dockerfile.match(/^ENV MODEL_URL="(.+)"$/m)?.[1];
	expect(production).toBe(modelUrl(DELTA_MODEL));
});
