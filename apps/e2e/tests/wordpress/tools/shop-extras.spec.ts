import { expect, test } from "@playwright/test";
import {
	type Cart,
	cartCount,
	expectCode,
	ok,
	skipUnlessWordPress,
	tool,
	WP,
	wpcli,
} from "../support/wp";

skipUnlessWordPress();

const SIMPLE = 263; // Calvin Klein CK One
const REVIEWED = 262; // its own product: a review the specs plant, used by no other test
const COUPON = "e2e10";

test.beforeAll(() => {
	// Idempotent fixtures: a 10% coupon, a review with a rating, a tag on a product (the Store API hides empty tags).
	wpcli(
		"eval",
		`if(!wc_get_coupon_id_by_code("${COUPON}")){$c=new WC_Coupon();$c->set_code("${COUPON}");$c->set_discount_type("percent");$c->set_amount(10);$c->save();}` +
			`if(!get_comments(["post_id"=>${REVIEWED},"type"=>"review","count"=>true])){$id=wp_insert_comment(["comment_post_ID"=>${REVIEWED},"comment_type"=>"review","comment_approved"=>1,"comment_author"=>"Ann","comment_content"=>"Lasts all day","comment_author_email"=>"ann@example.com"]);add_comment_meta($id,"rating",5);}` +
			`wp_set_object_terms(${REVIEWED},["E2E Gift"],"product_tag",true);`,
	);
});

test.describe("clear_cart", () => {
	test("empties a cart with several lines in one call", async ({ page }) => {
		await page.goto(WP);
		ok(await tool(page, "add_to_cart", { id: SIMPLE, quantity: 2 }));
		ok(await tool(page, "add_to_cart", { id: REVIEWED }));
		expect(await cartCount(page)).toBe(3);
		expect(ok(await tool(page, "clear_cart", {}))).toEqual({ cleared: true });
		expect(await cartCount(page)).toBe(0);
	});

	test("an empty cart stays empty, not an error", async ({ page }) => {
		await page.goto(WP);
		ok(await tool(page, "clear_cart", {}));
		expect(await cartCount(page)).toBe(0);
	});
});

test.describe("coupons", () => {
	test("apply shows the code and a lower total, remove takes it off", async ({
		page,
	}) => {
		await page.goto(WP);
		ok(await tool(page, "add_to_cart", { id: SIMPLE }));
		const before = ok<Cart & { total: string }>(
			await tool(page, "get_cart", {}),
		);
		const applied = ok<{ coupons: string[]; total: string }>(
			await tool(page, "apply_coupon", { code: COUPON.toUpperCase() }),
		);
		expect(applied.coupons).toEqual([COUPON]);
		expect(Number(applied.total)).toBeLessThan(Number(before.total));
		const removed = ok<{ coupons: string[] }>(
			await tool(page, "remove_coupon", { code: COUPON }),
		);
		expect(removed.coupons).toEqual([]);
		ok(await tool(page, "clear_cart", {}));
	});

	test("an unknown code is a code, never the shop's sentence", async ({
		page,
	}) => {
		await page.goto(WP);
		ok(await tool(page, "add_to_cart", { id: SIMPLE }));
		const r = await tool(page, "apply_coupon", { code: "no-such-code" });
		expect(r.ok).toBe(false);
		expectCode(r, "NOT_ALLOWED");
		ok(await tool(page, "clear_cart", {}));
	});

	test("a missing code names the argument", async ({ page }) => {
		await page.goto(WP);
		expectCode(await tool(page, "apply_coupon", {}), "MISSING_ARGUMENT");
	});
});

test("get_product_reviews returns rating, author and text; no id is MISSING_ARGUMENT", async ({
	page,
}) => {
	await page.goto(WP);
	const reviews = ok<{ rating: number; author: string; text: string }[]>(
		await tool(page, "get_product_reviews", { id: REVIEWED }),
	);
	expect(reviews).toContainEqual(
		expect.objectContaining({
			rating: 5,
			author: "Ann",
			text: "Lasts all day",
		}),
	);
	expectCode(await tool(page, "get_product_reviews", {}), "MISSING_ARGUMENT");
});

test("list_tags lists the shop's tags", async ({ page }) => {
	await page.goto(WP);
	const tags = ok<{ slug: string; name: string }[]>(
		await tool(page, "list_tags", {}),
	);
	expect(tags).toContainEqual(
		expect.objectContaining({ slug: "e2e-gift", name: "E2E Gift" }),
	);
});
