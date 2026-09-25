<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { enhance } from "$app/forms";
	import FormField from "$lib/components/form-field.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { useAdminEnhance } from "./use-admin-enhance";

	const content = useIntlayer("admins");
	const common = useIntlayer("common");
	const submitted = useAdminEnhance();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.create.title.value}</Card.Title>
		<Card.Description>{$content.create.hint.value}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/create" use:enhance={submitted} class="grid max-w-xl gap-3">
			<FormField id="new-name" name="name" label={$content.columns.name.value} />
			<FormField id="new-email" name="email" label={$content.columns.email.value} type="email" required />
			<FormField
				id="new-password"
				name="password"
				label={$content.create.tempPassword.value}
				type="password"
				minlength={8}
				autocomplete="new-password"
				required
			/>
			<Button type="submit" class="w-fit">{$common.create.value}</Button>
		</form>
	</Card.Content>
</Card.Root>
