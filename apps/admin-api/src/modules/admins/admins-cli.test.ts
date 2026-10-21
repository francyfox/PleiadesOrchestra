import { expect, test } from "bun:test";

const run = (...args: string[]) =>
	Bun.spawn(["bun", "src/index.ts", "admin:create", ...args], {
		cwd: `${import.meta.dir}/../../..`,
		env: {
			...process.env,
			ADMIN_DATABASE_PATH: ":memory:",
			ADMIN_API_KEY: "test",
			BETTER_AUTH_SECRET: "x".repeat(32),
			SENTRY_DSN: "",
		},
		stdout: "pipe",
		stderr: "pipe",
	});

test("`admin-api admin:create` prints a token and exits instead of serving", async () => {
	const proc = run("--email", "a@example.com", "--name", "A");
	expect(await proc.exited).toBe(0);
	expect(await new Response(proc.stdout).text()).toMatch(
		/^Created a@example\.com\. Access token \(shown once\):\n\n\S{20,}\n\n$/,
	);
});

test("a bad email exits 1 with the reason", async () => {
	const proc = run("--email", "nope");
	expect(await proc.exited).toBe(1);
	expect(await new Response(proc.stderr).text()).toContain("--email");
});
