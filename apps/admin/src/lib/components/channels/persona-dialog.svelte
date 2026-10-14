<script lang="ts">
	import LockIcon from "@lucide/svelte/icons/lock";
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import { channelActions } from "#lib/actions.js";
	import type { Channel, Persona } from "#lib/api-types.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { queries } from "#lib/query/queries.js";
	import { type PersonaForm, toForm, toPersona } from "./persona-draft";
	import { useChannelEnhance } from "./use-channel-enhance";

	/** The bot's name, role, tone and limits for one channel. Loaded only while open. */
	let {
		channel,
		open = $bindable(false),
	}: { channel: Channel; open: boolean } = $props();

	const content = useIntlayer("channels");
	const common = useIntlayer("common");
	const query = createQuery(() => ({
		...queries.persona(channel.id),
		enabled: open,
	}));
	const submitted = useChannelEnhance(
		channelActions.savePersona,
		undefined,
		() => (open = false),
	);

	// The form starts as the channel's values (standard ones where it never customized) and is dropped on close.
	let form = $state<PersonaForm | null>(null);
	let settled = $state<PersonaForm | null>(null);
	$effect(() => {
		if (!open) {
			form = null;
			settled = null;
		} else if (!form && query.data) {
			form = toForm(query.data.persona);
			settled = form;
		}
	});
	// Preview follows typing with a short delay: one server round-trip per pause, not per key.
	$effect(() => {
		if (!form) return;
		const snapshot = $state.snapshot(form);
		const timer = setTimeout(() => (settled = snapshot), 300);
		return () => clearTimeout(timer);
	});
	const emptyPersona: Persona = {
		botName: "",
		tone: "",
		instructions: "",
		defaultLang: "",
		greeting: "",
		forbiddenTopics: [],
		handoffContact: "",
	};

	const preview = createQuery(() => ({
		...queries.personaPreview(
			channel.id,
			settled ? toPersona(settled) : emptyPersona,
		),
		enabled: open && settled !== null,
	}));
	const defaults = $derived(query.data ? toForm(query.data.defaults) : null);
	const prompt = $derived(preview.data?.prompt ?? query.data?.prompt ?? "");
	const fixed = $derived(preview.data?.fixed ?? query.data?.fixed ?? "");
	const editable = $derived(
		fixed && prompt.endsWith(fixed) ? prompt.slice(0, -fixed.length) : prompt,
	);
</script>

{#snippet reset(key: keyof PersonaForm)}
	{#if form && defaults && form[key] !== defaults[key]}
		<Button
			variant="link"
			size="sm"
			type="button"
			class="h-auto p-0 text-xs"
			onclick={() => form && (form[key] = defaults[key])}
		>
			{$content.persona.resetToStandard.value}
		</Button>
	{/if}
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] w-full max-w-[min(40rem,calc(100vw-2rem))] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{$content.persona.title({ name: channel.name })}</Dialog.Title>
			<Dialog.Description>{$content.persona.hint.value}</Dialog.Description>
		</Dialog.Header>
		{#if form}
			<form use:submitted class="grid gap-3">
				<input type="hidden" name="id" value={channel.id} />
				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="persona-name">{$content.persona.botName.value}</Label>
						{@render reset("botName")}
					</div>
					<Input id="persona-name" name="botName" bind:value={form.botName} />
				</div>
				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="persona-instructions">{$content.persona.instructions.value}</Label>
						{@render reset("instructions")}
					</div>
					<Textarea id="persona-instructions" name="instructions" rows={4} maxlength={2000} bind:value={form.instructions} />
					<p class="text-xs text-muted-foreground">{$content.persona.instructionsHint.value}</p>
				</div>
				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="persona-tone">{$content.persona.tone.value}</Label>
						{@render reset("tone")}
					</div>
					<Input id="persona-tone" name="tone" bind:value={form.tone} />
					<p class="text-xs text-muted-foreground">{$content.persona.toneHint.value}</p>
				</div>
				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="persona-lang">{$content.persona.defaultLang.value}</Label>
						{@render reset("defaultLang")}
					</div>
					<Input id="persona-lang" name="defaultLang" bind:value={form.defaultLang} />
					<p class="text-xs text-muted-foreground">{$content.persona.defaultLangHint.value}</p>
				</div>
				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="persona-greeting">{$content.persona.greeting.value}</Label>
						{@render reset("greeting")}
					</div>
					<Textarea id="persona-greeting" name="greeting" bind:value={form.greeting} />
				</div>
				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="persona-topics">{$content.persona.forbiddenTopics.value}</Label>
						{@render reset("forbiddenTopics")}
					</div>
					<Textarea id="persona-topics" name="forbiddenTopics" bind:value={form.forbiddenTopics} />
				</div>
				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="persona-handoff">{$content.persona.handoffContact.value}</Label>
						{@render reset("handoffContact")}
					</div>
					<Input id="persona-handoff" name="handoffContact" bind:value={form.handoffContact} />
					<p class="text-xs text-muted-foreground">{$content.persona.handoffContactHint.value}</p>
				</div>
				<div class="grid gap-1">
					<Label>{$content.persona.previewTitle.value}</Label>
					<div class="overflow-hidden rounded-md border text-xs">
						<pre class="max-h-56 overflow-auto whitespace-pre-wrap bg-muted/40 p-3 font-mono">{editable.trimEnd()}</pre>
						{#if fixed}
							<div class="border-t border-dashed bg-muted p-3 font-mono">
								<p class="mb-1 font-sans text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
									<LockIcon class="mr-1 inline size-3" />{$content.persona.fixedBadge.value}
								</p>
								<pre class="whitespace-pre-wrap">{fixed}</pre>
							</div>
						{/if}
					</div>
				</div>
				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
					<Button type="submit">{$common.save.value}</Button>
				</Dialog.Footer>
			</form>
		{:else}
			<p class="text-sm text-muted-foreground">{$content.persona.loading.value}</p>
		{/if}
	</Dialog.Content>
</Dialog.Root>
