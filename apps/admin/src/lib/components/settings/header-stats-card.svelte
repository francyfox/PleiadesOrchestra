<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { headerStats } from "#lib/header-stats.js";

	/** Staff only (`/preferences`): the host stats in the header, off by default, remembered in this browser. */
	const content = useIntlayer("settings");
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.headerStats.title.value}</Card.Title>
		<Card.Description>{$content.headerStats.description.value}</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="flex items-center gap-3">
			<Switch id="header-stats" bind:checked={headerStats.current} />
			<Label for="header-stats">{$content.headerStats.label.value}</Label>
		</div>
	</Card.Content>
</Card.Root>
