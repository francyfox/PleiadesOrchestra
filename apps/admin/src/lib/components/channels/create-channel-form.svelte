<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { channelActions } from "$lib/actions";
	import FormField from "$lib/components/form-field.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import AccessModeSelect from "./access-mode-select.svelte";
	import { useChannelEnhance } from "./use-channel-enhance";

	const content = useIntlayer("channels");
	const common = useIntlayer("common");
	const submitted = useChannelEnhance(channelActions.create);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.create.title.value}</Card.Title>
		<Card.Description>{$content.create.hint.value}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form use:submitted class="grid max-w-xl gap-3">
			<FormField id="slug" label="Slug" placeholder="my-site" required />
			<FormField id="name" label={$content.create.name.value} required />
			<div class="grid gap-2">
				<Label for="accessMode">{$content.columns.access.value}</Label>
				<AccessModeSelect id="accessMode" />
			</div>
			<div class="grid gap-2">
				<Label for="allowedOrigins">{$content.create.origins.value}</Label>
				<Textarea id="allowedOrigins" name="allowedOrigins" placeholder="https://example.com" />
			</div>
			<Button type="submit" class="w-fit">{$common.create.value}</Button>
		</form>
	</Card.Content>
</Card.Root>
