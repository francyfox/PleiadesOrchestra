<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as UiTable from "$lib/components/ui/table/index.js";
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
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.comparison.title.value}</Card.Title></Card.Header>
	<Card.Content>
		<div class="overflow-hidden rounded-md border">
			<UiTable.Root>
				<UiTable.Header>
					<UiTable.Row>
						<UiTable.Head>{$content.comparison.metric.value}</UiTable.Head>
						<UiTable.Head>{$content.comparison.actual.value}</UiTable.Head>
						<UiTable.Head>{$content.comparison.ideal.value}</UiTable.Head>
						<UiTable.Head class="text-right">{$content.comparison.percent.value}</UiTable.Head>
					</UiTable.Row>
				</UiTable.Header>
				<UiTable.Body>
					{#each rows as row (row.metric)}
						<UiTable.Row>
							<UiTable.Cell class="font-medium">{$content.comparison.metrics[row.metric].value}</UiTable.Cell>
							<UiTable.Cell>{actual(row)}</UiTable.Cell>
							<UiTable.Cell class="text-muted-foreground">{ideal(row)}</UiTable.Cell>
							<UiTable.Cell class="text-right tabular-nums">
								{row.percent === null ? "—" : `${row.percent}%`}
							</UiTable.Cell>
						</UiTable.Row>
					{/each}
				</UiTable.Body>
			</UiTable.Root>
		</div>
	</Card.Content>
</Card.Root>
