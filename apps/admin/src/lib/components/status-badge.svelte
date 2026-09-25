<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { UserStatus } from "$lib/api-types";
	import { Badge } from "$lib/components/ui/badge/index.js";

	let { status }: { status: UserStatus } = $props();

	const common = useIntlayer("common");

	const variant = $derived(
		status === "blocked"
			? "destructive"
			: status === "pending"
				? "secondary"
				: "outline",
	);
</script>

<Badge {variant}>{$common.status[status].value}</Badge>
