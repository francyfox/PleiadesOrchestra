<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { RequestStatus } from "$lib/api-types";
	import { Badge } from "$lib/components/ui/badge/index.js";

	let { status }: { status: RequestStatus } = $props();

	const content = useIntlayer("flow");
	const variant = {
		running: "default",
		waiting: "secondary",
		succeeded: "outline",
		failed: "destructive",
		abandoned: "destructive",
	} as const;
</script>

<Badge variant={variant[status]} class={status === "running" ? "animate-pulse" : ""}>
	{$content.requests.status[status].value}
</Badge>
