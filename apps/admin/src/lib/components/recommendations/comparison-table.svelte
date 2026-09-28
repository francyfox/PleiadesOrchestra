<script lang="ts">
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { useIntlayer } from "svelte-intlayer";
	import DataTable from "$lib/components/data-table.svelte";
	import * as Card from "$lib/components/ui/card/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import {
		type ComparisonRow,
		IDEAL_MACHINE,
		type Vendor,
	} from "$lib/system/audit";

	/** This machine vs the reference, metric by metric. */
	let { rows }: { rows: ComparisonRow[] } = $props();

	const content = useIntlayer("recommendations");
	const format = useFormat();

	const VENDOR: Record<Vendor, string> = {
		nvidia: "NVIDIA",
		amd: "AMD",
		intel: "Intel",
		other: "GPU",
	};

	function actual(row: ComparisonRow): string {
		const a = row.actual;
		const c = $content.comparison;
		switch (row.metric) {
			case "cores":
				return String(a.value);
			case "ram":
				return $format.gb(a.bytes as number);
			case "vram":
				if (!a.present) return c.noGpu.value;
				return a.uma
					? `${$format.gb(a.bytes as number | null)} (UMA)`
					: $format.gb(a.bytes as number | null);
			case "gpu":
				return a.placement === "none"
					? $content.placement.none.value
					: `${$content.placement[a.placement as "integrated" | "dedicated"].value} ${VENDOR[(a.vendor as Vendor) ?? "other"]}`;
			case "simd": {
				const list = [
					a.avx2 && "AVX2",
					a.avx512 && "AVX-512",
					a.vnni && "VNNI",
				].filter(Boolean);
				return list.length ? list.join(" + ") : c.noAvx2.value;
			}
		}
	}

	function ideal(row: ComparisonRow): string {
		switch (row.metric) {
			case "cores":
				return String(IDEAL_MACHINE.physicalCores);
			case "ram":
				return $format.gb(IDEAL_MACHINE.ramBytes);
			case "vram":
				return $format.gb(IDEAL_MACHINE.vramBytes);
			case "gpu":
				return $content.comparison.idealGpu.value;
			case "simd":
				return "AVX2 + AVX-512 + VNNI";
		}
	}

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, ComparisonRow>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("metric", {
				header: () => $content.comparison.metric.value,
				cell: (ctx) => $content.comparison.metrics[ctx.getValue()].value,
			}),
			helper.display({
				id: "actual",
				header: () => $content.comparison.actual.value,
				cell: (ctx) => actual(ctx.row.original),
			}),
			helper.display({
				id: "ideal",
				header: () => $content.comparison.ideal.value,
				cell: (ctx) => ideal(ctx.row.original),
			}),
			helper.accessor("percent", {
				header: () => $content.comparison.percent.value,
				cell: (ctx) => {
					const value = ctx.getValue();
					return value === null ? "—" : `${value}%`;
				},
			}),
		]),
		get data() {
			return rows;
		},
		getRowId: (row) => row.metric,
	});
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.comparison.title.value}</Card.Title></Card.Header>
	<Card.Content>
		<DataTable {table} />
	</Card.Content>
</Card.Root>
