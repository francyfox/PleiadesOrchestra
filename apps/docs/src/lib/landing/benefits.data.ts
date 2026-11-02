// Code samples of the landing's "how it works" steps, one entry per step in benefits.json (same order).
// Language-independent and illustrative: names and values are made up, not a real channel or trace.
export type Sample = { name: string; lang: string; code: string };

// Written out in two parts: a literal closing script tag cannot sit in a Svelte file, and here it is just text.
const WIDGET = `<script src="https://unpkg.com/@shalotts/pleiades-widget/dist/pleiades-widget.js" defer></script>

<pleiades-chat
  agent-url="https://agent.example.com"
  publishable-key="pk_your_channel_key"
></pleiades-chat>`;

export const STEP_SAMPLES: Sample[][] = [
	[
		{
			name: "tools.js",
			lang: "js",
			code: `document.modelContext.registerTool({
  name: "add_to_cart",
  description: "Add a product to the cart",
  inputSchema: {
    type: "object",
    properties: { productId: { type: "string" } },
    required: ["productId"],
  },
  async execute({ productId }) {
    await cart.add(productId);
    return { content: [{ type: "text", text: "Added" }] };
  },
});`,
		},
	],
	[
		{
			name: "channel",
			lang: "json",
			code: `{
  "name": "My shop",
  "publishableKey": "pk_your_channel_key"
}`,
		},
	],
	[
		{ name: "index.html", lang: "html", code: WIDGET },
		{
			name: "main.js",
			lang: "js",
			code: `import "@shalotts/pleiades-widget"; // registers <pleiades-chat>`,
		},
	],
	// The widget step shows a screenshot instead of code.
	[],
	[
		{
			name: "run.json",
			lang: "json",
			code: `{
  "goal": "Add the cheapest cheese to the cart",
  "steps": [
    { "action": "search_products", "status": "ok" },
    { "action": "add_to_cart", "status": "error", "answer": "out of stock" }
  ],
  "cost": "per run, per model call",
  "revenue": "orders after the chat"
}`,
		},
	],
	// The dashboard step shows a screenshot instead of code.
	[],
];

// Screenshots of the steps without code, by step index: static/media/<file>-<locale>.webp at its rendered size,
// alt and caption from `<file>Alt`/`<file>Note` in benefits.json.
export const STEP_SHOTS: Record<
	number,
	{ file: "widget" | "dashboard"; width: number; height: number }
> = {
	// The real <pleiades-chat> panel (light theme, 2x) driven by Playwright with a mocked NDJSON agent reply.
	3: { file: "widget", width: 340, height: 657 },
	// The real admin page with made-up numbers.
	5: { file: "dashboard", width: 1400, height: 667 },
};
