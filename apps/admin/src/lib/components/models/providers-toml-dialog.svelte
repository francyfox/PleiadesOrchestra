<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check-check";
	import FileCodeIcon from "@lucide/svelte/icons/file-code";
	import SaveIcon from "@lucide/svelte/icons/save";
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import { toast } from "svelte-sonner";
	import { providerActions } from "#lib/actions.js";
	import { api } from "#lib/api/client.js";
	import { unwrap } from "#lib/api/result.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { queries } from "#lib/query/queries.js";
	import { toDiagnostics } from "#lib/toml-check.js";
	import type { TomlEditor } from "./toml-editor.js";
	import { useModelsEnhance } from "./use-models-enhance";

	/** The whole providers.toml as text (keys masked); the orchestrator validates it before writing. */
	const content = useIntlayer("models");
	const common = useIntlayer("common");
	let open = $state(false);
	const query = createQuery(() => ({
		...queries.providersToml(),
		enabled: open,
	}));
	const submitted = useModelsEnhance(
		providerActions.saveToml,
		() => (open = false),
	);

	let text = $state("");
	let editor: TomlEditor | undefined;
	let checking = $state(false);

	let form = $state<HTMLFormElement>();

	/** true = the file passes; `quiet` skips the "no errors" toast (a save follows). */
	async function check(quiet = false): Promise<boolean> {
		if (!editor || checking) return false;
		const sent = editor.text();
		editor.mark([]);
		checking = true;
		try {
			const { errors } = await unwrap(
				api()["providers-toml"].check.post({ toml: sent }),
			);
			// The text changed while the request ran: its line numbers no longer fit.
			if (editor?.text() !== sent) return false;
			const { diagnostics, listed } = toDiagnostics(errors, sent);
			editor.mark(diagnostics);
			// Errors with a line are marked in the editor; the rest (schema paths) go into the toast.
			if (!errors.length) {
				if (!quiet) toast.success($content.toml.check.ok.value);
				return true;
			}
			toast.error(String($content.toml.check.count({ count: errors.length })), {
				description: listed
					.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
					.join("; "),
			});
			return false;
		} catch {
			toast.error($content.toml.check.failed.value);
			return false;
		} finally {
			checking = false;
		}
	}

	/** Checks first, so a bad file is marked in the editor instead of failing the save; before the editor has loaded, the server's own check on save is enough. */
	async function save() {
		if (!editor || (await check(true))) form?.requestSubmit();
	}

	/** Mounts CodeMirror from a lazy chunk; the dialog content unmounting destroys it. */
	function mountEditor(node: HTMLElement, initial: string) {
		let stopped = false;
		text = initial;
		import("./toml-editor.js").then(({ createTomlEditor }) => {
			if (stopped) return;
			editor = createTomlEditor(node, {
				doc: initial,
				label: $content.toml.editorLabel.value,
				onChange: (next) => (text = next),
				onCheck: check,
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

<Button variant="outline" onclick={() => (open = true)}>
	<FileCodeIcon data-icon="inline-start" />
	{$content.toml.action.value}
</Button>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] w-full max-w-[min(48rem,calc(100vw-2rem))] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{$content.toml.title.value}</Dialog.Title>
			<Dialog.Description>{$content.toml.hint.value}</Dialog.Description>
		</Dialog.Header>
		{#if query.data}
			<form bind:this={form} use:submitted class="grid gap-3">
				<input type="hidden" name="toml" value={text} />
				<div use:mountEditor={query.data.toml}></div>
				<Dialog.Footer>
					<Button
						variant="outline"
						type="button"
						disabled={checking}
						title={$content.toml.check.title.value}
						onclick={() => check()}
					>
						<CheckIcon data-icon="inline-start" />{$content.toml.check.action.value}
					</Button>
					<Button variant="ghost" type="button" onclick={() => (open = false)}>{$common.cancel.value}</Button>
					<Button type="button" disabled={checking} onclick={save}><SaveIcon data-icon="inline-start" />{$common.save.value}</Button>
				</Dialog.Footer>
			</form>
		{:else}
			<p class="text-sm text-muted-foreground">{$content.loading.value}</p>
		{/if}
	</Dialog.Content>
</Dialog.Root>
