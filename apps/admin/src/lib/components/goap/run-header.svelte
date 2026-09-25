<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { PlanRun } from "$lib/api-types";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { formatGoal } from "$lib/goap-graph";
	import { useFormat } from "$lib/i18n/use-format";

	let { run }: { run: PlanRun } = $props();

	const content = useIntlayer("goap");
	const format = useFormat();
</script>

<div>
	<h1 class="text-2xl font-semibold">{$content.run.title.value}</h1>
	<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
		<Badge variant={run.succeeded ? "outline" : "destructive"}>
			{run.succeeded ? $content.nodeStatus.reached.value : $content.nodeStatus.missed.value}
		</Badge>
		<span>{$content.run.goal({ goal: formatGoal(run.goal) })}</span>
		<span>· {$content.run.attempts({ count: run.attempts })}</span>
		<span>· {$format.ms(run.durationMs)}</span>
		<span>· {$format.date(run.createdAt)}</span>
		<a class="underline-offset-4 hover:underline" href={`/users/${encodeURIComponent(run.userId)}`}>
			· {$content.run.user.value}
		</a>
	</div>
</div>
