<script lang="ts">
	import LanguagesIcon from "@lucide/svelte/icons/languages";
	import type { Locale } from "intlayer";
	import { useIntlayer, useLocale } from "svelte-intlayer";
	import { invalidateAll } from "$app/navigation";
	import * as Select from "$lib/components/ui/select/index.js";

	const content = useIntlayer("locale-switcher");
	const { locale, setLocale, availableLocales } = useLocale();

	/** Each language in its own name — the same in every UI language. */
	const NATIVE_NAMES: Record<string, string> = {
		ru: "Русский",
		en: "English",
		kk: "Қазақша",
	};

	function change(next: string) {
		if (next === $locale) return;
		// Updates the context + writes Intlayer's locale cookie, so the next
		// request (hooks.server.ts → root layout data) keeps the same language.
		setLocale(next as Locale);
		document.documentElement.lang = next;
		void invalidateAll();
	}
</script>

<Select.Root type="single" value={$locale} onValueChange={change}>
	<Select.Trigger size="sm" class="w-auto gap-1.5" aria-label={$content.label.value}>
		<LanguagesIcon class="size-4" />
		{NATIVE_NAMES[$locale] ?? $locale}
	</Select.Trigger>
	<Select.Content align="end">
		{#each availableLocales as item (item)}
			<Select.Item value={item}>{NATIVE_NAMES[item] ?? item}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
