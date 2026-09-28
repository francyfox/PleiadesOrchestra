import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createAuth } from "./auth";
import { type AdminDb, countAdmins, openAdminDb } from "./db";

const MIGRATIONS = join(import.meta.dir, "../drizzle");
const BASE_URL = "http://localhost:3002";

let db: AdminDb;
let auth: ReturnType<typeof createAuth>;

beforeEach(() => {
	db = openAdminDb(":memory:", MIGRATIONS);
	auth = createAuth({
		db,
		secret: "test-secret-test-secret-test-secret",
		baseURL: BASE_URL,
	});
});

function signUp(email: string, password = "correct-horse-battery") {
	return auth.handler(
		new Request(`${BASE_URL}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: BASE_URL },
			body: JSON.stringify({ email, password, name: email }),
		}),
	);
}

function sessionHeaders(response: Response): Headers {
	const cookie = response.headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");
	return new Headers({ cookie });
}

describe("admin registration", () => {
	test("the first sign-up creates an admin and signs it in", async () => {
		const response = await signUp("first@example.com");

		expect(response.status).toBe(200);
		const session = await auth.api.getSession({
			headers: sessionHeaders(response),
		});
		expect(session?.user.email).toBe("first@example.com");
		expect(session?.user.role).toBe("admin");
	});

	test("once an admin exists, a direct POST to /sign-up/email is forbidden", async () => {
		await signUp("first@example.com");

		const response = await signUp("intruder@example.com");

		expect(response.status).toBe(403);
		expect(await countAdmins(db)).toBe(1);
	});

	test("a signed-in admin can still create further admins server-side", async () => {
		const first = await signUp("first@example.com");

		const { user } = await auth.api.createUser({
			headers: sessionHeaders(first),
			body: {
				email: "second@example.com",
				password: "another-long-password",
				name: "Second",
				role: "admin",
			},
		});

		expect(user.role).toBe("admin");
		expect(await countAdmins(db)).toBe(2);
	});

	test("accounts created without an explicit role are still admins", async () => {
		const first = await signUp("first@example.com");

		const { user } = await auth.api.createUser({
			headers: sessionHeaders(first),
			body: {
				email: "third@example.com",
				password: "another-long-password",
				name: "Third",
			},
		});

		expect(user.role).toBe("admin");
	});
});
