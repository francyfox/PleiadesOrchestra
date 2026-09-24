<script lang="ts">
	import type { UserStatus } from "$lib/api-types";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { STATUS_LABELS } from "$lib/format";

	let { status }: { status: UserStatus } = $props();

	const variant = $derived(
		status === "blocked"
			? "destructive"
			: status === "pending"
				? "secondary"
				: "outline",
	);
</script>

<Badge {variant}>{STATUS_LABELS[status]}</Badge>
