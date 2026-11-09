<script lang="ts">
	import MoonIcon from "@lucide/svelte/icons/moon";
	import SunIcon from "@lucide/svelte/icons/sun";
	import { toggleMode } from "mode-watcher";
	import { useIntlayer } from "svelte-intlayer";
	import { Button } from "#lib/components/ui/button/index.js";

	const content = useIntlayer("theme-switcher");
</script>

<Button variant="outline" size="icon-sm" onclick={toggleMode} aria-label={$content.label.value}>
	<SunIcon class="dark:hidden" />
	<MoonIcon class="hidden dark:block" />
</Button>
