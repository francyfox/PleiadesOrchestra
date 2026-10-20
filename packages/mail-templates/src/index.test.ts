import { describe, expect, test } from "bun:test";
import { compileTemplates } from "../scripts/build-templates.ts";
import { TEMPLATES } from "./generated.ts";
import { type MailKind, renderMail } from "./index.ts";

const kinds = Object.keys(TEMPLATES) as MailKind[];
const link = "https://panel.example/verify?token=a&b=1";

describe("renderMail", () => {
	for (const kind of kinds) {
		for (const locale of ["ru", "en"]) {
			test(`${kind} ${locale}: filled, link escaped in href and plain in text`, () => {
				const mail = renderMail(kind, { locale, link });
				expect(mail.html).not.toContain("{{");
				expect(mail.html).toContain(
					'href="https://panel.example/verify?token=a&amp;b=1"',
				);
				expect(mail.text).toContain(link);
				expect(mail.text).not.toContain("{{");
				expect(mail.subject.length).toBeGreaterThan(0);
			});
		}
	}

	test("a markup payload in name and link is escaped", () => {
		const payload = '"><script>alert(1)</script>';
		const mail = renderMail("verify", {
			link: `https://x.example/?q=${payload}`,
			name: payload,
		});
		expect(mail.html).not.toContain("<script>");
		expect(mail.html).toContain("&lt;script&gt;");
		expect(mail.html).not.toContain('"><script');
	});

	test("a placeholder inside a value is not expanded again", () => {
		expect(renderMail("verify", { link, name: "{{footer}}" }).html).toContain(
			"{{footer}}",
		);
	});

	test("non-http(s) links throw", () => {
		for (const bad of [
			"javascript:alert(1)",
			"data:text/html,x",
			"/relative",
			"",
		])
			expect(() => renderMail("reset", { link: bad })).toThrow();
	});

	test("ru for ru, en for everything else", () => {
		expect(renderMail("reset", { link, locale: "ru" }).subject).toBe(
			"Сброс пароля",
		);
		for (const locale of ["en", "kk", null, undefined])
			expect(renderMail("reset", { link, locale }).subject).toBe(
				"Reset your password",
			);
	});
});

test("src/generated.ts is up to date (run `bun run build:templates`)", async () => {
	const file = Bun.file(new URL("./generated.ts", import.meta.url));
	expect(await file.text()).toBe(await compileTemplates());
});
