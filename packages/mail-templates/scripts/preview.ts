// Writes every mail × locale to preview/ (gitignored) to open in a browser.
// Rebuilds the templates first, so an edited .mjml shows up without a separate step.
import { $ } from "bun";

await $`bun scripts/build-templates.ts`;
// Imported after the rebuild: a static import would render the old templates.
const { TEMPLATES } = await import("../src/generated.ts");
const { renderMail } = await import("../src/index.ts");
const dir = new URL("../preview/", import.meta.url).pathname;
const kinds = Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[];
for (const kind of kinds)
	for (const locale of ["ru", "en"] as const) {
		const { html } = renderMail(kind, {
			locale,
			link: `https://admin.example.com/user/${kind}?token=preview`,
			name: locale === "ru" ? "Анна" : "Anna",
		});
		await Bun.write(`${dir}${kind}.${locale}.html`, html);
	}
console.log(`preview: ${dir}`);
