<script lang="ts">
	import { Handle, type NodeProps, Position } from "@xyflow/svelte";
	import { useIntlayer } from "svelte-intlayer";

	/**
	 * One node renderer for both GOAP graphs (run trace and action catalog):
	 * label plus optional detail lines, colored by `data.status`/`data.kind`.
	 */
	let { data }: NodeProps = $props();

	const content = useIntlayer("goap");

	const status = $derived(String(data.status ?? data.kind ?? ""));
	const details = $derived(
		Array.isArray(data.details) ? (data.details as string[]) : [],
	);

	const tone: Record<string, string> = {
		done: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950",
		reached: "border-emerald-600 bg-emerald-100 dark:bg-emerald-900",
		diverged: "border-amber-500 bg-amber-50 dark:bg-amber-950",
		skipped: "border-slate-400 bg-slate-50 dark:bg-slate-900 border-dashed",
		failed: "border-red-500 bg-red-50 dark:bg-red-950",
		missed: "border-red-600 bg-red-100 dark:bg-red-900",
		started: "border-sky-500 bg-sky-50 dark:bg-sky-950",
		not_reached: "border-slate-300 bg-background opacity-60 border-dashed",
		action: "border-primary bg-background",
		fact: "border-slate-300 bg-muted rounded-full",
	};
</script>

<Handle type="target" position={Position.Left} />
<div class={["min-w-36 rounded-md border-2 px-3 py-2 text-xs shadow-sm", tone[status] ?? "border-border bg-background"]}>
	<div class="font-medium">{data.kind === "no_plan" ? $content.noPlan.value : String(data.label ?? "")}</div>
	{#each details as line (line)}
		<div class="text-muted-foreground">{line}</div>
	{/each}
</div>
<Handle type="source" position={Position.Right} />
