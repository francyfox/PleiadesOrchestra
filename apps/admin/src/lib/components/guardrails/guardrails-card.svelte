<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { tick } from "svelte";
	import { useIntlayer } from "svelte-intlayer";
	import { guardrailActions } from "#lib/actions.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";
	import { queries } from "#lib/query/queries.js";
	import GuardrailsRulesDialog from "./guardrails-rules-dialog.svelte";

	/** Staff only: the `/guardrails` page. The switch saves at once; the rules open in a dialog with a lazily loaded editor. */
	const guardrails = createQuery(() => queries.guardrails());
	const content = useIntlayer("guardrails");
	const save = useActionEnhance({ run: guardrailActions.save });
	let form = $state<HTMLFormElement>();
	let next = $state(false);

	async function toggle(checked: boolean) {
		next = checked;
		await tick();
		form?.requestSubmit();
	}
</script>

{#if guardrails.data}
	<Card.Root>
		<Card.Content class="grid gap-4">
			<form bind:this={form} use:save class="flex items-start gap-3">
				<input type="hidden" name="enabled" value={String(next)} />
				<input type="hidden" name="rules" value={guardrails.data.rules} />
				<Switch
					id="guardrails-enabled"
					checked={guardrails.data.enabled}
					onCheckedChange={toggle}
					aria-describedby="guardrails-hint"
				/>
				<div class="grid gap-1">
					<label for="guardrails-enabled" class="text-sm font-medium">{$content.enabled.value}</label>
					<p id="guardrails-hint" class="text-xs text-muted-foreground">{$content.enabledHint.value}</p>
				</div>
			</form>
			<div>
				<GuardrailsRulesDialog
					enabled={guardrails.data.enabled}
					rules={guardrails.data.rules}
					defaults={guardrails.data.defaults}
				/>
			</div>
		</Card.Content>
	</Card.Root>
{:else}
	<p class="text-sm text-muted-foreground">{$content.loading.value}</p>
{/if}
