import { describe, expect, test } from "bun:test";
import { buildMail } from "./mail.service.ts";
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

	test("the body carries the link", () => {
		expect(buildMail("verify", "a@b.c", "http://l/x", "en").body).toContain(
			"http://l/x",
		);
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

	test("a failing SMTP server is logged, not thrown", async () => {
		const lines: string[] = [];
		const mailer = createMailer({
			host: "127.0.0.1",
			port: 1,
			pass: "x",
			from: "f@x.y",
			log: (line) => lines.push(line),
		});
		await mailer.send(buildMail("verify", "a@b.c", "http://l/x", "en"));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toStartWith("mail to a@b.c failed");
	});
});
