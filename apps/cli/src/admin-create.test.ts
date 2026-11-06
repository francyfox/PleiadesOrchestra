import { expect, test } from "bun:test";
import { adminCreateArgv, adminCreateMode } from "./commands/admin-create.ts";

const args = ["--email", "a@b.c", "--level", "0"];

test("admin:create runs where the admin API is: its own binary (inside the image), the `pleiades` container (one-command install), else the compose service (development)", () => {
	expect(adminCreateArgv("local", args)).toEqual([
		"admin-api",
		"admin:create",
		...args,
	]);
	expect(adminCreateArgv("container", args)).toEqual([
		"docker",
		"exec",
		"pleiades",
		"admin-api",
		"admin:create",
		...args,
	]);
	expect(adminCreateArgv("compose", args)).toEqual([
		"docker",
		"compose",
		"-p",
		"pleiades-orchestra",
		"exec",
		"-T",
		"admin-api",
		"admin-api",
		"admin:create",
		...args,
	]);
});

test("the mode is chosen in that order", () => {
	expect(
		adminCreateMode({ hasBinary: true, runningContainers: ["pleiades"] }),
	).toBe("local");
	expect(
		adminCreateMode({ hasBinary: false, runningContainers: ["x", "pleiades"] }),
	).toBe("container");
	// A container with a similar name is not ours.
	expect(
		adminCreateMode({
			hasBinary: false,
			runningContainers: ["pleiades-orchestra-admin-api-1"],
		}),
	).toBe("compose");
	expect(adminCreateMode({ hasBinary: false, runningContainers: [] })).toBe(
		"compose",
	);
});
