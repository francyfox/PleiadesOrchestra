<script lang="ts">
	import { page } from "$app/state";
	import * as Alert from "$lib/components/ui/alert/index.js";
</script>

<Alert.Root variant="destructive">
	<Alert.Title>Ошибка {page.status}</Alert.Title>
	<Alert.Description>
		{page.status === 503 ? "Оркестратор недоступен. " : ""}{page.error?.message ?? ""}
	</Alert.Description>
</Alert.Root>
