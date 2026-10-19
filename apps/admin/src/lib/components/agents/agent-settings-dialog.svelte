<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { get } from "svelte/store";
	import { useIntlayer } from "svelte-intlayer";
	import { agentActions } from "#lib/actions.js";
	import type { Agent } from "#lib/api-types.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { queries } from "#lib/query/queries.js";

	/** One agent's model settings: overrides over the env defaults. Loaded only while open. */
	let { agent, open = $bindable(false) }: { agent: Agent; open: boolean } =
		$props();

	const content = useIntlayer("agents");
	const common = useIntlayer("common");
	const format = useFormat();
	const query = createQuery(() => ({
		...queries.agentSettings(agent.id),
		enabled: open,
	}));
	const keys = createQuery(() => ({
		...queries.providerKeys(),
		enabled: open,
	}));

	const fieldErrors = (code: string) =>
		code === "invalid_json"
			? get(content).settings.errors[code].value
			: undefined;
	const save = useActionEnhance({
		run: agentActions.save,
		errorText: fieldErrors,
		onSuccess: () => (open = false),
	});
	const reset = useActionEnhance({ run: agentActions.reset });
	let answer = $state("");
	const test = useActionEnhance({
		run: agentActions.test,
		quietSuccess: () => true,
		onSuccess: (data) =>
			(answer = String(
				get(content).settings.testResult({
					answer: String(data.answer ?? ""),
					ms: get(format).number(Number(data.latencyMs ?? 0)),
				}),
			)),
	});

	// The source select decides which fields show; it starts as the saved one and is dropped on close.
	let source = $state<"local" | "external" | null>(null);
	$effect(() => {
		if (!open) {
			source = null;
			answer = "";
		} else if (source === null && query.data) {
			source = query.data.overrides.source ?? "local";
		}
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
		{#if query.data && source !== null}
			{@const view = query.data}
			{#if !view.editable}
				<p class="text-sm text-muted-foreground">{$content.settings.readOnly.value}</p>
				<p class="font-mono text-sm">{view.effective.baseUrl} · {view.effective.model}</p>
			{:else}
				<form use:save class="grid gap-3">
					<input type="hidden" name="id" value={agent.id} />
					<div class="grid gap-2">
						<Label for="agent-source">{$content.settings.source.value}</Label>
						<select id="agent-source" name="source" bind:value={source} class={selectClass}>
							<option value="local">{$content.settings.local.value}</option>
							<option value="external">{$content.settings.external.value}</option>
						</select>
					</div>
					{#if source === "external"}
						<div class="grid gap-2">
							<Label for="agent-base-url">{$content.settings.baseUrl.value}</Label>
							<Input id="agent-base-url" name="baseUrl" value={view.overrides.baseUrl ?? ""} placeholder={view.defaults.baseUrl ?? ""} />
						</div>
						<div class="grid gap-2">
							<Label for="agent-model">{$content.settings.model.value}</Label>
							<Input id="agent-model" name="model" value={view.overrides.model ?? ""} placeholder={view.defaults.model} />
						</div>
						<div class="grid gap-2">
							<Label for="agent-key">{$content.settings.providerKey.value}</Label>
							<select id="agent-key" name="providerKey" value={view.overrides.providerKey ?? ""} class={selectClass}>
								<option value="">{$content.settings.noKey.value}</option>
								{#each keys.data?.items ?? [] as key (key.name)}
									<option value={key.name}>{key.name} ({key.mask})</option>
								{/each}
							</select>
						</div>
					{/if}
					<div class="grid gap-2">
						<Label for="agent-temperature">{$content.settings.temperature.value}</Label>
						<Input
							id="agent-temperature"
							name="temperature"
							type="number"
							step="0.1"
							min="0"
							max="2"
							value={view.overrides.parameters.temperature ?? ""}
							placeholder={view.defaults.temperature === null ? "" : `${view.defaults.temperature} (${$content.settings.envValue.value})`}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="agent-effort">{$content.settings.reasoningEffort.value}</Label>
						<select id="agent-effort" name="reasoningEffort" value={view.overrides.parameters.reasoningEffort ?? ""} class={selectClass}>
							<option value="">{view.defaults.reasoningEffort ?? "—"} ({$content.settings.envValue.value})</option>
							<option value="none">none</option>
							<option value="low">low</option>
							<option value="medium">medium</option>
							<option value="high">high</option>
						</select>
					</div>
					<div class="grid gap-2">
						<Label for="agent-extra">{$content.settings.extraBody.value}</Label>
						<Textarea
							id="agent-extra"
							name="extraBody"
							rows={3}
							class="font-mono text-xs"
							value={Object.keys(view.overrides.parameters.extraBody ?? {}).length ? JSON.stringify(view.overrides.parameters.extraBody) : ""}
						/>
						<p class="text-xs text-muted-foreground">{$content.settings.extraBodyHint.value}</p>
					</div>
					<Dialog.Footer>
						<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
						<Button type="submit">{$common.save.value}</Button>
					</Dialog.Footer>
				</form>
				<div class="flex flex-wrap items-center gap-2 border-t pt-3">
					<form use:test>
						<input type="hidden" name="id" value={agent.id} />
						<Button variant="outline" type="submit">{$content.settings.test.value}</Button>
					</form>
					<form use:reset>
						<input type="hidden" name="id" value={agent.id} />
						<Button variant="outline" type="submit">{$content.settings.reset.value}</Button>
					</form>
					{#if answer}<p class="text-sm text-muted-foreground">{answer}</p>{/if}
				</div>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground">{$content.settings.loading.value}</p>
		{/if}
	</Dialog.Content>
</Dialog.Root>
