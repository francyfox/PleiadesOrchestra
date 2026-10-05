<script lang="ts">
	import { Handle, type NodeProps, Position } from "@xyflow/svelte";
	import { useIntlayer } from "svelte-intlayer";
	import { useFormat } from "$lib/i18n/use-format";
	import { elapsedMs } from "$lib/request-graph";

	/**
	 * One node of a request's decision graph: what it is, how it stands and how
	 * long it took. The operation in progress pulses and its time counts up
	 * from the moment the snapshot arrived (`data.receivedAt`).
	 */
	let { data, selected }: NodeProps = $props();

	const content = useIntlayer("flow");
	const format = useFormat();

	const status = $derived(String(data.status));
	const live = $derived(data.live === true);
	const kind = $derived(String(data.kind));

	let now = $state(Date.now());
	$effect(() => {
		if (!live) return;
		const timer = setInterval(() => (now = Date.now()), 100);
		return () => clearInterval(timer);
	});
	const elapsed = $derived(
		elapsedMs(
			typeof data.durationMs === "number" ? data.durationMs : null,
			live,
			typeof data.receivedAt === "number" ? data.receivedAt : now,
			now,
		),
	);

	const tone: Record<string, string> = {
		done: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950",
		reached: "border-emerald-600 bg-emerald-100 dark:bg-emerald-900",
		running:
			"border-sky-500 bg-sky-50 dark:bg-sky-950 ring-4 ring-sky-400/50 animate-pulse",
		browser:
			"border-violet-500 bg-violet-50 dark:bg-violet-950 ring-4 ring-violet-400/50 animate-pulse",
		diverged: "border-amber-500 bg-amber-50 dark:bg-amber-950",
		skipped: "border-slate-400 bg-slate-50 dark:bg-slate-900 border-dashed",
		failed: "border-red-500 bg-red-50 dark:bg-red-950",
		missed: "border-red-600 bg-red-100 dark:bg-red-900",
		pending: "border-slate-300 bg-background border-dashed",
		not_reached: "border-slate-300 bg-background opacity-60 border-dashed",
	};
	const kindTone: Record<string, string> = {
		prompt: "border-primary bg-primary/5",
		translate: "border-primary/40 bg-background",
		classify: "border-primary/50 bg-background",
		understand: "border-primary/60 bg-background",
	};

	type Kind = keyof typeof $content.nodeKind;
	type Status = keyof typeof $content.nodeStatus;
</script>

<Handle type="target" position={Position.Left} />
<div
	class={[
		"w-52 rounded-md border-2 px-3 py-2 text-xs shadow-sm transition-colors",
		kindTone[kind] ?? tone[status] ?? "border-border bg-background",
		kind === "understand" && status === "running" ? tone.running : "",
		selected ? "outline-2 outline-offset-2 outline-primary" : "",
	]}
>
	<div class="text-[10px] uppercase tracking-wide text-muted-foreground">
		{$content.nodeKind[kind as Kind].value}
	</div>
	<div class="truncate font-medium" title={String(data.label ?? "")}>
		{String(data.label ?? "") || "—"}
	</div>
	{#if kind !== "prompt"}
		<div class="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
			<span class="truncate">{$content.nodeStatus[status as Status].value}</span>
			{#if elapsed !== null}
				<span class="font-mono tabular-nums text-foreground">{$format.ms(elapsed)}</span>
			{/if}
		</div>
	{/if}
</div>
<Handle type="source" position={Position.Right} />
