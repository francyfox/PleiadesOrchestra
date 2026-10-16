<script lang="ts">
	import type { PleiadesChatElement } from "@shalotts/pleiades-widget";

	interface Props {
		agentUrl: string;
		publishableKey: string;
		/** Which demo is on screen. */
		demoId: string;
		/** The demo has its own channel; otherwise it shares the fallback key. */
		ownChannel: boolean;
	}

	const { agentUrl, publishableKey, demoId, ownChannel }: Props = $props();

	let chat = $state<PleiadesChatElement | null>(null);
	let lastDemoId: string | null = null;

	// A demo with its own key already gets its own conversation (the key switches the
	// channel). Demos on the shared key keep one thread, so a new demo starts a new one.
	$effect(() => {
		const id = demoId;
		const own = ownChannel;
		if (lastDemoId !== null && lastDemoId !== id && !own)
			void chat?.resetSession();
		lastDemoId = id;
	});
</script>

<div class="panel pleiades-panel">
	<div class="panel-header">
		<span aria-hidden="true" class="panel-icon">○</span>
		PleiadesOrchestra
		<span class="panel-subtitle">widget</span>
	</div>
	<div class="pleiades-body">
		<pleiades-chat
			bind:this={chat}
			agent-url={agentUrl}
			publishable-key={publishableKey}
			open
			position="bottom-right"
		></pleiades-chat>
	</div>
</div>

<style>
	.pleiades-panel {
		grid-area: pleiades;
	}

	.pleiades-body {
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	:global(pleiades-chat) {
		position: absolute;
		inset: 0;
	}

	/* Keep the panel always open and fill the container */
	:global(pleiades-chat::part(launcher)) {
		display: none;
	}

	:global(pleiades-chat::part(close)) {
		display: none;
	}

	:global(pleiades-chat::part(panel)) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		border-radius: 0;
		box-shadow: none;
		border: none;
		transform: none !important;
	}
</style>
