<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { financeActions } from "#lib/actions.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";

	/** Staff only (`/preferences`): catch up on Polar webhooks that never arrived. */
	const content = useIntlayer("settings");
	const sync = useActionEnhance({
		run: financeActions.syncPolar,
		successText: (data) =>
			$content.polarSync.done({
				applied: String(data.applied),
				unchanged: String(data.unchanged),
				skipped: String(data.skipped),
			}).value,
		errorText: (code) =>
			code === "billing_unavailable" || code === "billing_failed"
				? $content.polarSync[code].value
				: undefined,
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.polarSync.title.value}</Card.Title>
		<Card.Description>{$content.polarSync.description.value}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form use:sync>
			<Button type="submit">{$content.polarSync.action.value}</Button>
		</form>
	</Card.Content>
</Card.Root>
