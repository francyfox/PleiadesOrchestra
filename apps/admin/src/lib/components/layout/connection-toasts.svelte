<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { toast } from "svelte-sonner";
	import { onConnectionChange } from "$lib/live/connection";

	/**
	 * One persistent toast per problem while it lasts (the socket to the panel's
	 * server is gone / the data source behind it doesn't answer), replaced by a
	 * short "restored" one when it is over. Renders nothing itself.
	 */
	const content = useIntlayer("connection-toasts");

	const IDS = {
		socket: "connection-socket",
		upstream: "connection-upstream",
	} as const;

	$effect(() =>
		onConnectionChange((problem, active) => {
			if (active) {
				toast.error($content[problem].title.value, {
					id: IDS[problem],
					description: $content[problem].description.value,
					duration: Number.POSITIVE_INFINITY,
				});
			} else {
				toast.dismiss(IDS[problem]);
				toast.success($content.restored.value, {
					id: `${IDS[problem]}-restored`,
					duration: 3000,
				});
			}
		}),
	);
</script>
