<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import DataTable from "$lib/components/data-table.svelte";

	const content = useIntlayer("faq");

	type Row = {
		name: string;
		type: string;
		/** A literal default, or which localized phrase to show. */
		default:
			| { literal: string }
			| { phrase: "required" | "byLanguage" | "pageLanguage" };
		description:
			| "agentUrl"
			| "publishableKey"
			| "position"
			| "heading"
			| "greeting"
			| "placeholder"
			| "lang"
			| "open";
	};

	const ROWS: Row[] = [
		{
			name: "agent-url",
			type: "string",
			default: { phrase: "required" },
			description: "agentUrl",
		},
		{
			name: "publishable-key",
			type: "string",
			default: { phrase: "required" },
			description: "publishableKey",
		},
		{
			name: "position",
			type: `"bottom-left" | "bottom-right" | "top-left" | "top-right"`,
			default: { literal: `"bottom-left"` },
			description: "position",
		},
		{
			name: "heading",
			type: "string",
			default: { phrase: "byLanguage" },
			description: "heading",
		},
		{
			name: "greeting",
			type: "string",
			default: { phrase: "byLanguage" },
			description: "greeting",
		},
		{
			name: "placeholder",
			type: "string",
			default: { phrase: "byLanguage" },
			description: "placeholder",
		},
		{
			name: "lang",
			type: `"en" | "ru" | "kk"`,
			default: { phrase: "pageLanguage" },
			description: "lang",
		},
		{
			name: "open",
			type: "boolean",
			default: { literal: "false" },
			description: "open",
		},
	];

	const defaultText = (row: Row) =>
		"literal" in row.default
			? row.default.literal
			: $content.start.attributes[row.default.phrase].value;

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Row>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", {
				header: () => $content.start.attributes.columns.name.value,
				cell: (ctx) => renderSnippet(name, ctx.getValue()),
			}),
			helper.accessor("type", {
				header: () => $content.start.attributes.columns.type.value,
				cell: (ctx) => renderSnippet(mono, ctx.getValue()),
			}),
			helper.display({
				id: "default",
				header: () => $content.start.attributes.columns.default.value,
				cell: (ctx) => defaultText(ctx.row.original),
			}),
			helper.display({
				id: "description",
				header: () => $content.start.attributes.columns.description.value,
				cell: (ctx) =>
					$content.start.attributes.rows[ctx.row.original.description].value,
			}),
		]),
		data: ROWS,
	});
</script>

{#snippet name(text: string)}
	<code class="font-mono text-xs whitespace-nowrap">{text}</code>
{/snippet}

{#snippet mono(text: string)}
	<code class="font-mono text-xs">{text}</code>
{/snippet}

<DataTable {table} wrap />
