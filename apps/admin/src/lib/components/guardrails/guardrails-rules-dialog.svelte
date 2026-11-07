<script lang="ts">
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import SaveIcon from "@lucide/svelte/icons/save";
	import { useIntlayer } from "svelte-intlayer";
	import { toast } from "svelte-sonner";
	import { guardrailActions } from "#lib/actions.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";
	import { ruleErrors } from "#lib/guardrails-rules.js";
	import type { GuardrailsEditor } from "./guardrails-editor.js";

	let {
		enabled,
		rules,
		defaults,
	}: { enabled: boolean; rules: string; defaults: string } = $props();

	const content = useIntlayer("guardrails");
	const common = useIntlayer("common");
	let open = $state(false);
	let text = $state("");
	let editor: GuardrailsEditor | undefined;
	let form = $state<HTMLFormElement>();

	const submitted = useActionEnhance({
		run: guardrailActions.save,
		onSuccess: () => (open = false),
		// The server's 422: `{ errors: [{ line, message }] }`, marked on their lines.
		onFailure: (data) => {
			if (Array.isArray(data.errors)) editor?.mark(data.errors);
		},
	});

	/** Bad lines are marked by the editor's own linter; nothing is sent until they are fixed. */
	function save() {
		const count = ruleErrors(editor?.text() ?? text).length;
		if (count) toast.error(String($content.dialog.errors({ count })));
		else form?.requestSubmit();
	}

	/** Mounts CodeMirror from a lazy chunk; the dialog content unmounting destroys it. */
	function mountEditor(node: HTMLElement, initial: string) {
		let stopped = false;
		text = initial;
		import("./guardrails-editor.js").then(({ createGuardrailsEditor }) => {
			if (stopped) return;
			editor = createGuardrailsEditor(node, {
				doc: initial,
				label: $content.dialog.editorLabel.value,
				onChange: (next) => (text = next),
			});
		});
		return {
			destroy() {
				stopped = true;
				editor?.destroy();
				editor = undefined;
			},
		};
	}
</script>

<Button variant="outline" onclick={() => (open = true)}>{$content.editRules.value}</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="flex h-[min(90vh,44rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col sm:max-w-5xl">
		<Dialog.Header class="shrink-0">
			<Dialog.Title>{$content.dialog.title.value}</Dialog.Title>
			<Dialog.Description>{$content.dialog.hint.value}</Dialog.Description>
		</Dialog.Header>
		<form bind:this={form} use:submitted class="flex min-h-0 flex-1 flex-col gap-3">
			<input type="hidden" name="enabled" value={String(enabled)} />
			<input type="hidden" name="rules" value={text} />
			<div class="min-h-0 flex-1 [&_.cm-editor]:h-full!" use:mountEditor={rules}></div>
			<Dialog.Footer class="shrink-0">
				<Button variant="outline" type="button" onclick={() => editor?.replace(defaults)}>
					<RotateCcwIcon data-icon="inline-start" />{$content.dialog.reset.value}
				</Button>
				<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
				<Button type="button" onclick={save}><SaveIcon data-icon="inline-start" />{$common.save.value}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
