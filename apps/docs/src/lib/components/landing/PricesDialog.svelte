<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";
	import PricesTable from "./PricesTable.svelte";

	let t = $derived(
		landingContent(localeFromPath(page.url.pathname)).pricing.live,
	);

	interface LivePricing {
		topUps: {
			paidUsd: number;
			creditedTr: number;
			feesAndTaxUsd: number;
			serviceUsd: number;
		}[];
		models: {
			id: string;
			inputPerMillionTr: number;
			outputPerMillionTr: number;
			cacheReadPerMillionTr?: number;
		}[];
	}

	// The page is prerendered and static: without an orchestrator URL there is no button at all.
	const base = __PUBLIC_ENV__.PUBLIC_PLEIADES_AGENT_URL;

	async function load(): Promise<LivePricing> {
		const response = await fetch(`${base}/v1/public/pricing`);
		if (!response.ok) throw new Error(`pricing: ${response.status}`);
		return response.json();
	}

	let dialog = $state<HTMLDialogElement>();
	// Fetched on the first open and kept; a failed load is retried with the button in the dialog.
	let pricing = $state.raw<Promise<LivePricing>>();
	function open() {
		pricing ??= load();
		dialog?.showModal();
	}
</script>

{#if base}
	<button type="button" class="chip border px-[0.75rem] py-[0.5rem] text-sm! font-bold!" onclick={open}>
		{t.open}
	</button>

	<!-- Esc closes it natively; the backdrop click is a mouse shortcut for the close button. -->
	<dialog
		bind:this={dialog}
		class="dlg m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-hidden border border-(--dlg-rule)! p-0 text-base leading-normal"
		aria-labelledby="prices-title"
		onclick={(event) => event.target === dialog && dialog.close()}
	>
		<div class="grid max-h-[calc(100dvh-2rem)] auto-rows-max overflow-y-auto overscroll-contain">
			<div class="relative grid grid-cols-1 content-start gap-3 p-6">
				<form method="dialog" class="absolute top-3 right-3">
					<button type="submit" class="grid size-8 place-items-center rounded-full hover:bg-(--dlg-rule)" aria-label={t.close}><XIcon size={18} aria-hidden="true" /></button>
				</form>
				<h3 id="prices-title" class="text-xl! font-bold!">{t.title}</h3>

				{#await pricing}
					<div class="grid min-h-48 content-center place-items-center gap-3" role="status">
						<span class="size-7 animate-spin rounded-full border-3 border-current! border-r-transparent! motion-reduce:[animation-duration:2.4s]" aria-hidden="true"></span>
						<span>{t.loading}</span>
					</div>
				{:then live}
					{#if live}
						<PricesTable
							head={[t.paid, t.credited, t.fees, t.service]}
							rows={live.topUps.map((row) => [
								`$${row.paidUsd}`,
								`${row.creditedTr} TR`,
								`$${row.feesAndTaxUsd}`,
								`$${row.serviceUsd}`,
							])}
						/>
						<p class="text-xs text-(--dlg-dim)">{t.note}</p>
						{#if live.models.length}
							<details>
								<summary class="text-sm">{t.modelsTitle}</summary>
								<PricesTable
										class="max-h-56"
										head={[t.model, t.input, t.output, t.cached]}
										rows={live.models.map((model) => [
											model.id,
											model.inputPerMillionTr,
											model.outputPerMillionTr,
											model.cacheReadPerMillionTr ?? "—",
										])}
									/>
							</details>
						{/if}
					{/if}
				{:catch}
					<div class="grid min-h-48 content-center place-items-center gap-3" role="alert">
						<p>{t.error}</p>
						<button type="button" class="border border-(--dlg-rule)! px-3 py-1 text-sm hover:border-current!" onclick={() => (pricing = load())}>
							{t.retry}
						</button>
					</div>
				{/await}
			</div>
			<img
				src="/media/not-maid.webp"
				alt={t.image}
				width="673"
				height="482"
				loading="lazy"
				class="block h-auto max-h-64 w-full object-contain"
			/>
		</div>
	</dialog>
{/if}

<style>
	/* The palette of the admin's notice-dialog: a gray gradient, dark text; the rest is Tailwind. */
	.dlg {
		background: linear-gradient(to bottom, #f4f4f5, #e4e4e7, #a1a1aa);
		color: #18181b;
		--dlg-dim: #27272a;
		--dlg-rule: rgb(0 0 0 / 0.2);
	}
	:global(.dark) .dlg {
		background: linear-gradient(to bottom, #3f3f46, #27272a, #09090b);
		color: #f4f4f5;
		--dlg-dim: #d4d4d8;
		--dlg-rule: rgb(255 255 255 / 0.2);
	}
	.dlg::backdrop {
		background: rgb(0 0 0 / 0.55);
	}
</style>
