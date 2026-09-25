<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import * as Accordion from "$lib/components/ui/accordion/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import {
		type Audit,
		type MachineReport,
		type ScoreClass,
		scoreClass,
		type Vendor,
	} from "$lib/system/audit";
	import AuditMarker from "./audit-marker.svelte";

	/** Every check in one card: marker, title, value; advice in the accordion body. */
	let { report }: { report: MachineReport } = $props();

	const content = useIntlayer("recommendations");
	const common = useIntlayer("common");
	const format = useFormat();

	// Lighthouse ordering: failing first, then average, informational, passed last.
	const ORDER: Record<ScoreClass, number> = {
		fail: 0,
		average: 1,
		info: 2,
		pass: 3,
	};
	const audits = $derived(
		report.categories
			.flatMap((category) =>
				category.audits.map((audit) => ({ ...audit, category: category.id })),
			)
			.sort((a, b) => ORDER[scoreClass(a.score)] - ORDER[scoreClass(b.score)]),
	);

	const VENDOR: Record<Vendor, string> = {
		nvidia: "NVIDIA",
		amd: "AMD",
		intel: "Intel",
		other: "GPU",
	};
	const gb = (value: unknown) => $format.gb(value as number | null);
	const yesNo = (value: unknown) =>
		value ? $common.yes.value : $common.no.value;

	/** Localized title / value / advice for one audit, from its id, variant and raw facts. */
	function text(audit: Audit): {
		title: string;
		display: string;
		description: string;
	} {
		const a = $content.audits;
		const f = audit.facts;
		const v = audit.variant ?? "";
		switch (audit.id) {
			case "physical-cores":
				return {
					title: a["physical-cores"].title.value,
					display: String(
						a["physical-cores"].display({
							actual: String(f.actual),
							ideal: String(f.ideal),
						}),
					),
					description: a["physical-cores"].description.value,
				};
			case "simd":
			case "avx512":
			case "vnni":
				return {
					title: a[audit.id].title.value,
					display: yesNo(f.present),
					description: a[audit.id].description.value,
				};
			case "smt-threads": {
				const params = {
					physical: String(f.physical),
					logical: String(f.logical),
				};
				return {
					title: a["smt-threads"].title.value,
					display: String(a["smt-threads"].display(params)),
					description: String(a["smt-threads"].description(params)),
				};
			}
			case "cpu-load":
				return {
					title: a["cpu-load"].title.value,
					display: String(
						a["cpu-load"].display({ percent: String(f.percent) }),
					),
					description: a["cpu-load"].description[v as "busy" | "normal"].value,
				};
			case "ram-total":
				return {
					title: a["ram-total"].title.value,
					display: String(
						a["ram-total"].display({
							actual: gb(f.actual),
							ideal: gb(f.ideal),
						}),
					),
					description: a["ram-total"].description.value,
				};
			case "ram-available":
				return {
					title: a["ram-available"].title.value,
					display: gb(f.bytes),
					description: a["ram-available"].description[v as "low" | "ok"].value,
				};
			case "uma-bandwidth":
				return {
					title: a["uma-bandwidth"].title.value,
					display: String(
						a["uma-bandwidth"].display({ vram: gb(f.vram), gtt: gb(f.gtt) }),
					),
					description: a["uma-bandwidth"].description.value,
				};
			case "accelerator": {
				const vendor = VENDOR[(f.vendor as Vendor) ?? "other"];
				return {
					title: a.accelerator.title.value,
					display:
						v === "none"
							? a.accelerator.display.none.value
							: String(
									a.accelerator.display[v as "integrated" | "dedicated"]({
										vendor,
									}),
								),
					description: a.accelerator.description.value,
				};
			}
			case "vram":
				return {
					title: a.vram.title.value,
					display:
						v === "none"
							? a.vram.display.none.value
							: v === "integrated"
								? String(a.vram.display.integrated({ gtt: gb(f.gtt) }))
								: String(
										a.vram.display.dedicated({
											vram: gb(f.vram),
											ideal: gb(f.ideal),
										}),
									),
					description: a.vram.description.value,
				};
			case "laya-gpu":
				return {
					title: a["laya-gpu"].title.value,
					display: a["laya-gpu"].display[v as "cuda" | "cpu"].value,
					description: a["laya-gpu"].description.value,
				};
			case "gpu-backend": {
				const key = v as "none" | "nvidia" | "amdDedicated" | "integrated";
				const rocm =
					key === "integrated" && f.vendor === "amd"
						? ` ${a["gpu-backend"].rocmNote.value}`
						: "";
				return {
					title: a["gpu-backend"].title.value,
					display: a["gpu-backend"].display[key].value,
					description: a["gpu-backend"].description[key].value + rocm,
				};
			}
		}
	}

	const TONE: Record<ScoreClass, string> = {
		pass: "text-emerald-600 dark:text-emerald-400",
		average: "text-amber-500 dark:text-amber-400",
		fail: "text-red-600 dark:text-red-400",
		info: "text-muted-foreground",
	};
</script>

<Card.Root>
	<Card.Header><Card.Title>{$content.checksTitle.value}</Card.Title></Card.Header>
	<Card.Content>
		<Accordion.Root type="multiple">
			{#each audits as audit (audit.id)}
				{@const kind = scoreClass(audit.score)}
				{@const item = text(audit)}
				<Accordion.Item value={audit.id}>
					<Accordion.Trigger>
						<span class="flex flex-1 items-center gap-3 pr-3">
							<AuditMarker {kind} />
							<span class="flex-1">{item.title}</span>
							<span class={`text-xs tabular-nums ${TONE[kind]}`}>{item.display}</span>
						</span>
					</Accordion.Trigger>
					<Accordion.Content>
						<div class="grid gap-2 pl-6 text-sm text-muted-foreground">
							<p>{item.description}</p>
							<p class="text-xs">
								{$content.categories[audit.category].value}{#if audit.score !== null}
									· {$content.scoreOf({ score: Math.round(audit.score * 100) })}{/if}
							</p>
						</div>
					</Accordion.Content>
				</Accordion.Item>
			{/each}
		</Accordion.Root>
	</Card.Content>
</Card.Root>
