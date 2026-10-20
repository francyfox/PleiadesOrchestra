import { describe, expect, test } from "bun:test";
import { buildMail, isEmailChangeToken } from "./mail.service.ts";
import { createMailer } from "./mail.ts";

describe("buildMail", () => {
	test("ru for ru, en for everything else", () => {
		expect(buildMail("reset", "a@b.c", "http://l", "ru").subject).toBe(
			"Сброс пароля",
		);
		for (const locale of ["en", "kk", null, undefined]) {
			expect(buildMail("reset", "a@b.c", "http://l", locale).subject).toBe(
				"Reset your password",
			);
		}
	});

	test("both bodies carry the link", () => {
		const mail = buildMail("verify", "a@b.c", "http://l/x", "en");
		expect(mail.text).toContain("http://l/x");
		expect(mail.html).toContain('href="http://l/x"');
	});
});

describe("createMailer", () => {
	test("without a password it logs the subject and link instead of sending", async () => {
		const lines: string[] = [];
		const mailer = createMailer({
			host: "h",
			port: 465,
			from: "f@x.y",
			log: (line) => lines.push(line),
		});
		await mailer.send(buildMail("verify", "a@b.c", "http://l/x", "en"));
		expect(lines).toEqual(["mail to a@b.c: Confirm your email http://l/x"]);
	});

	test("a failing SMTP server is reported as an error, not thrown", async () => {
		const lines: string[] = [];
		const failures: unknown[] = [];
		const mailer = createMailer({
			host: "127.0.0.1",
			port: 1,
			pass: "x",
			from: "f@x.y",
			log: (line) => lines.push(line),
			onError: (error) => failures.push(error),
		});
		await mailer.send(buildMail("verify", "a@b.c", "http://l/x", "en"));
		expect(lines).toEqual([]);
		expect(failures).toHaveLength(1);
		expect(String(failures[0])).toStartWith("Error: mail to a@b.c failed");
	});
});

describe("isEmailChangeToken", () => {
	const jwt = (payload: object) =>
		`h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
	test("true only for a token with updateTo", () => {
		expect(isEmailChangeToken(jwt({ email: "a@b.c", updateTo: "n@b.c" }))).toBe(
			true,
		);
		expect(isEmailChangeToken(jwt({ email: "a@b.c" }))).toBe(false);
		expect(isEmailChangeToken("garbage")).toBe(false);
	});
});
