import { describe, expect, test } from "bun:test";
import { Fragment, h, raw, render } from "./jsx.ts";

describe("jsx templates", () => {
	test("renders elements, attributes and text to an HTML string", () => {
		expect(
			render(
				<p class="a" part="b">
					hi
				</p>,
			),
		).toBe('<p class="a" part="b">hi</p>');
	});

	test("keeps Alpine's long-form directives as written", () => {
		expect(
			render(
				<button
					type="button"
					x-on:click="go"
					x-bind:disabled="off"
					x-text="label"
				/>,
			),
		).toBe(
			'<button type="button" x-on:click="go" x-bind:disabled="off" x-text="label"></button>',
		);
	});

	test("escapes text and attribute values, so nothing from outside becomes markup", () => {
		const evil = `"><script>alert(1)</script>`;
		const out = render(<p title={evil}>{evil}</p>);
		expect(out).not.toContain("<script>");
		expect(out).toBe(
			'<p title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</p>',
		);
	});

	test("a true attribute is bare, false/undefined/null are left out", () => {
		expect(render(<input type="radio" checked={true} disabled={false} />)).toBe(
			'<input type="radio" checked>',
		);
		expect(render(<i hidden={undefined} data-x={null} />)).toBe("<i></i>");
	});

	test("void elements have no closing tag", () => {
		expect(render(<br />)).toBe("<br>");
	});

	test("a number is text; nested arrays and fragments flatten; empty values vanish", () => {
		expect(
			render(
				<>
					{[1, 2].map((n) => (
						<i>{n}</i>
					))}
					{null}
					{false}
					<b>x</b>
				</>,
			),
		).toBe("<i>1</i><i>2</i><b>x</b>");
	});

	test("a component is a function of its props and children", () => {
		const Label = ({
			name,
			children,
		}: {
			name: string;
			children?: unknown;
		}) => <label for={name}>{children}</label>;
		expect(render(<Label name="a">text</Label>)).toBe(
			'<label for="a">text</label>',
		);
	});

	test("markup from a component is not escaped a second time", () => {
		const Inner = () => <b>&</b>;
		expect(
			render(
				<p>
					<Inner />
				</p>,
			),
		).toBe("<p><b>&amp;</b></p>");
	});

	test("raw() inserts trusted markup (an icon) untouched", () => {
		expect(render(<b>{raw('<svg a="1"/>')}</b>)).toBe('<b><svg a="1"/></b>');
	});

	test("the compiler's development-only props never become attributes", () => {
		expect(render(h("p", { __source: {}, __self: {}, class: "a" }))).toBe(
			'<p class="a"></p>',
		);
	});
});
