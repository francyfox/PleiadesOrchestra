<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import SaveIcon from "@lucide/svelte/icons/save";
	import { createQuery } from "@tanstack/svelte-query";
	import { AgentPick } from "admin-api/forms";
	import { get } from "svelte/store";
	import { useIntlayer } from "svelte-intlayer";
	import { agentActions, agentPickOverrides } from "#lib/actions.js";
	import type { Agent } from "#lib/api-types.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { FieldError } from "#lib/components/ui/field-error/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { queries } from "#lib/query/queries.js";

	/** Picks an agent's model from the Models tab; the parameters come with the model. Loaded only while open. */
	let { agent, open = $bindable(false) }: { agent: Agent; open: boolean } =
		$props();

	const content = useIntlayer("agents");
	const common = useIntlayer("common");
	const format = useFormat();
	const query = createQuery(() => ({
		...queries.agentSettings(agent.id),
		enabled: open,
	}));
	const providers = createQuery(() => ({
		...queries.providers(),
		enabled: open,
	}));

	const save = useActionEnhance({
		run: agentActions.save,
		schema: AgentPick,
		overrides: agentPickOverrides,
		onSuccess: () => (open = false),
	});
	const errors = save.errors;
	const errorText = useFieldErrorText();
	/** What the last test sent and got back (the model's own token counts when it reports them). */
	let result = $state<{
		input?: string;
		answer?: string;
		probability?: number;
		inputTokens?: number;
		outputTokens?: number;
		latencyMs?: number;
	} | null>(null);
	const test = useActionEnhance({
		run: agentActions.test,
		quietSuccess: () => true,
		onSuccess: (data) => (result = data),
	});
	$effect(() => {
		if (!open) result = null;
	});

	const selectClass =
		"h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] w-full max-w-[min(36rem,calc(100vw-2rem))] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{$content.settings.title({ name: agent.name })}</Dialog.Title>
			<Dialog.Description>{$content.settings.hint.value}</Dialog.Description>
		</Dialog.Header>
		{#if query.data && providers.data}
			{@const view = query.data}
			<form id="agent-settings-form" use:save novalidate class="grid gap-2">
				<input type="hidden" name="id" value={agent.id} />
				<Label for="agent-model" required>{$content.settings.model.value}</Label>
				<!-- "<provider>\t<model id>": a model id may hold "/" or ":" -->
				<select id="agent-model" name="model" required aria-invalid={!!($errors?.model ?? $errors?.provider)} value={view.provider ? `${view.provider}\t${view.model}` : ""} class={selectClass}>
					{#if !view.provider}
						<option value="" disabled>{view.model} ({$content.settings.envServer.value})</option>
					{/if}
					{#each providers.data.items as p (p.id)}
						{@const models = p.models.filter((m) => m.types.includes(agent.role === "decision" ? "decision" : "language"))}
						{#if models.length}
							<optgroup label={p.name}>
								{#each models as m (m.id)}
									<option value={`${p.id}\t${m.id}`}>{m.name}</option>
								{/each}
							</optgroup>
						{/if}
					{/each}
				</select>
				{#if $errors?.model ?? $errors?.provider}<FieldError>{$errorText($errors?.model ?? $errors?.provider)}</FieldError>{/if}
				<p class="font-mono text-xs text-muted-foreground">{view.baseUrl}</p>
			</form>
			<div class="flex flex-wrap items-center gap-2 border-t pt-3">
				<form use:test>
					<input type="hidden" name="id" value={agent.id} />
					<Button variant="outline" type="submit"><ActivityIcon data-icon="inline-start" />{$content.settings.test.value}</Button>
				</form>
				<Button type="submit" form="agent-settings-form" class="ml-auto"><SaveIcon data-icon="inline-start" />{$common.save.value}</Button>
				{#if result}
					<dl class="grid basis-full grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
						{#if result.input}
							<dt class="text-muted-foreground">{$content.settings.testSent.value}</dt>
							<dd class="break-words font-mono text-xs">{result.input}</dd>
						{/if}
						<dt class="text-muted-foreground">{$content.settings.testAnswer.value}</dt>
						<dd class="break-words font-mono text-xs">{result.answer}</dd>
						{#if result.probability !== undefined}
							<dt class="text-muted-foreground">{$content.settings.testProbability.value}</dt>
							<dd>{($format.percent(result.probability))}</dd>
						{/if}
						{#if result.inputTokens !== undefined || result.outputTokens !== undefined}
							<dt class="text-muted-foreground">{$content.settings.testTokensLabel.value}</dt>
							<dd>{$content.settings.testTokens({ input: $format.number(result.inputTokens), output: $format.number(result.outputTokens) })}</dd>
						{/if}
						<dt class="text-muted-foreground">{$content.settings.testTime.value}</dt>
						<dd>{$format.ms(result.latencyMs)}</dd>
					</dl>
				{/if}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{$content.settings.loading.value}</p>
		{/if}
	</Dialog.Content>
</Dialog.Root>
