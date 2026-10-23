// Copies the public catalog (Store API), categories and recipes of a demo WordPress into demo-data.json
// for import-demo.php. Usage: bun dev/pull-demo.ts [https://wordpress-fa0a6.wasmer.app]
const site = (process.argv[2] ?? "https://wordpress-fa0a6.wasmer.app").replace(
	/\/$/,
	"",
);

async function pages(path: string): Promise<unknown[]> {
	const all: unknown[] = [];
	for (let page = 1; ; page++) {
		const res = await fetch(
			`${site}/wp-json/${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
		);
		if (!res.ok) throw new Error(`${path} page ${page}: HTTP ${res.status}`);
		const rows = (await res.json()) as unknown[];
		all.push(...rows);
		if (page >= Number(res.headers.get("x-wp-totalpages") ?? 1)) return all;
	}
}

const data = {
	categories: await pages("wc/store/v1/products/categories"),
	products: await pages("wc/store/v1/products"),
	variations: await pages("wc/store/v1/products?type=variation"),
	recipes: await pages("wp/v2/pleiades_recipe"),
};
await Bun.write(`${import.meta.dir}/demo-data.json`, JSON.stringify(data));
console.log(
	Object.entries(data)
		.map(([k, v]) => `${k}: ${v.length}`)
		.join(", "),
);
