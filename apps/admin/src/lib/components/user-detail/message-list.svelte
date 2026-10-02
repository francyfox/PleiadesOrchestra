<script lang="ts">
	import SvelteVirtualChat from "@humanspeak/svelte-virtual-chat";
	import { useIntlayer } from "svelte-intlayer";
	import { userActions } from "$lib/actions";
	import type { AdminMessage } from "$lib/api-types";
	import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { useActionEnhance } from "$lib/components/use-action-enhance";
	import { useFormat } from "$lib/i18n/use-format";

	/** The user's last ≤10 messages with per-answer usage and plan links. */
	let { userId, messages }: { userId: string; messages: AdminMessage[] } =
		$props();

	const content = useIntlayer("user-detail");
	const format = useFormat();

	let eraseOpen = $state(false);
	const submitted = useActionEnhance({
		run: () => userActions.deleteMessages(userId),
		onSettled: () => (eraseOpen = false),
	});
</script>

<section class="grid gap-2">
	<div class="flex items-center justify-between">
		<h2 class="font-medium">{$content.messages.title({ count: messages.length })}</h2>
		{#if messages.length > 0}
			<Button variant="ghost" size="sm" onclick={() => (eraseOpen = true)}>{$content.messages.erase.value}</Button>
		{/if}
	</div>
	{#if messages.length === 0}
		<p class="text-sm text-muted-foreground">{$content.messages.none.value}</p>
	{:else}
		<div class="h-[480px] rounded-md border">
			<SvelteVirtualChat
				{messages}
				getMessageId={(message: AdminMessage) => message.id}
				estimatedMessageHeight={96}
				containerClass="h-full"
				viewportClass="h-full"
				viewportLabel={$content.messages.viewportLabel.value}
			>
				{#snippet renderMessage(message: AdminMessage)}
					<div class={["flex p-3", message.role === "user" ? "justify-end" : "justify-start"]}>
						<div
							class={[
								"max-w-[80%] rounded-lg px-3 py-2 text-sm",
								message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
							]}
						>
							<!-- Plain text on purpose: this is user/model input, never {@html}. -->
							<p class="whitespace-pre-wrap break-words">{message.content}</p>
							<div class="mt-1 flex flex-wrap gap-2 text-[11px] opacity-70">
								<span>{$format.date(message.createdAt)}</span>
								<span>{$content.messages.thread({ id: message.threadId })}</span>
								{#if message.usage}
									<span>
										{$content.messages.tokens({
											input: $format.number(message.usage.inputTokens),
											output: $format.number(message.usage.outputTokens),
											latency: $format.ms(message.usage.latencyMs),
										})}
									</span>
								{/if}
								{#if message.planRunId}
									<a class="underline" href={`/goap?id=${encodeURIComponent(message.planRunId)}`}>
										{$content.messages.plan.value}
									</a>
								{/if}
							</div>
						</div>
					</div>
				{/snippet}
			</SvelteVirtualChat>
		</div>
	{/if}
</section>

<ConfirmDialog
	bind:open={eraseOpen}
	title={$content.eraseDialog.title.value}
	description={$content.eraseDialog.description.value}
	submitLabel={$content.eraseDialog.submit.value}
	{submitted}
/>
