import { expect, test } from "@playwright/test";
import { skipUnlessWordPress, WP, wpcli } from "../support/wp";

skipUnlessWordPress();

const SKU = "DJ-GRO-BRD-APP-016";
const tag = `sec${Date.now()}`;
const created: string[] = [];

const createRecipe = (title: string, extra: string[] = []) => {
	const id = wpcli(
		"post",
		"create",
		"--post_type=pleiades_recipe",
		"--post_status=publish",
		`--post_title=${title}`,
		...extra,
		"--porcelain",
	);
	created.push(id);
	return id;
};
const withIngredient = (id: string, note: string) =>
	wpcli(
		"post",
		"meta",
		"update",
		id,
		"ingredients",
		JSON.stringify([{ sku: SKU, quantity: 1, note }]),
		"--format=json",
	);
const html = async (url: string) => (await fetch(url)).text();

test.afterAll(() => {
	// REST keeps a post whose meta it rejected, so those are found by title.
	const rejected = wpcli(
		"post",
		"list",
		"--post_type=pleiades_recipe",
		"--post_status=any",
		`--s=meta-${tag}`,
		"--field=ID",
	).split("\n");
	const ids = [...created, ...rejected].filter(Boolean);
	if (ids.length) wpcli("post", "delete", ...ids, "--force");
});

test.describe("WordPress plugin security", () => {
	test("inline config has no raw angle brackets", async () => {
		createRecipe(`</script><script>window.pwned=1</script> ${tag}`);
		const page = await html(WP);
		const config =
			/window\.PleiadesWp=(.*?);\s*(?:\/\/# sourceURL=\S+\s*)?<\/script>/s.exec(
				page,
			)?.[1];
		expect(config).toBeDefined();
		expect(config).not.toMatch(/[<>]/);
		expect(
			JSON.parse(config as string).recipes.map((r: { name: string }) => r.name),
		).toContain(`</script><script>window.pwned=1</script> ${tag}`);
	});

	test("password-protected recipe is hidden from the config and the page", async () => {
		const id = createRecipe(`Secret ${tag}`, ["--post_password=pw"]);
		withIngredient(id, `note-${tag}`);
		expect(await html(WP)).not.toContain(`Secret ${tag}`);
		expect(await html(`${WP}/?p=${id}`)).not.toContain(`note-${tag}`);
	});

	test("settings sanitize does not throw on array input", () => {
		const out = wpcli(
			"eval",
			`try { Pleiades_Options::sanitize( array( 'key' => 'pk_x', 'agent_url' => array( 'a' ), 'position' => array( 'b' ) ) ); echo 'ok'; } catch ( Throwable $e ) { echo $e->getMessage(); }`,
		);
		expect(out).toBe("ok");
	});

	test("recipe meta limits are enforced over REST", () => {
		const status = (meta: string) =>
			wpcli(
				"eval",
				`wp_set_current_user( 1 ); $r = new WP_REST_Request( 'POST', '/wp/v2/pleiades_recipe' ); $r->set_body_params( array( 'title' => 'meta-${tag}', 'status' => 'draft', 'meta' => ${meta} ) ); $res = rest_get_server()->dispatch( $r ); if ( $res->get_status() < 300 ) { wp_delete_post( $res->get_data()['id'], true ); } echo $res->get_status();`,
			);
		expect(status(`array( 'servings' => -5 )`)).toBe("400");
		expect(status(`array( 'time_minutes' => 99999999999 )`)).toBe("400");
		expect(
			status(
				`array( 'ingredients' => array_fill( 0, 500, array( 'sku' => 'a', 'quantity' => 1, 'note' => '' ) ) )`,
			),
		).toBe("400");
		expect(
			status(
				`array( 'ingredients' => array( array( 'sku' => 'a', 'quantity' => -3, 'note' => '' ) ) )`,
			),
		).toBe("400");
		expect(
			status(
				`array( 'servings' => 4, 'ingredients' => array( array( 'sku' => 'a', 'quantity' => 2, 'note' => 'ok' ) ) )`,
			),
		).toBe("201");
	});
});
