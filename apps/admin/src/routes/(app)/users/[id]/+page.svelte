<script lang="ts">
	import SvelteVirtualChat from "@humanspeak/svelte-virtual-chat";
	import type { SubmitFunction } from "@sveltejs/kit";
	import {
		createColumnHelper,
		createTable,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { toast } from "svelte-sonner";
	import { enhance } from "$app/forms";
	import type { AdminMessage, UsageByModel } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import StatusBadge from "$lib/components/status-badge.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import UsageChart from "$lib/components/usage-chart.svelte";
	import { formatDate, formatMs, formatNumber, totalTokens } from "$lib/format";

	let { data } = $props();

	const user = $derived(data.details.user);
	let blockOpen = $state(false);
	let deleteOpen = $state(false);

	const submitted: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === "failure")
				toast.error(String(result.data?.message ?? "Ошибка"));
			else if (result.type === "success") toast.success("Готово");
			blockOpen = false;
			deleteOpen = false;
			await update();
		};
	};

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, UsageByModel>();
	const columns = helper.columns([
		helper.accessor("model", { header: "Модель" }),
		helper.accessor("kind", { header: "Тип вызова" }),
		helper.accessor("inputTokens", {
			header: "Вход",
			cell: (ctx) => formatNumber(ctx.getValue()),
		}),
		helper.accessor("outputTokens", {
			header: "Выход",
			cell: (ctx) => formatNumber(ctx.getValue()),
		}),
		helper.accessor("calls", {
			header: "Вызовов",
			cell: (ctx) => formatNumber(ctx.getValue()),
		}),
		helper.accessor("callsWithoutUsage", {
			header: "Без usage",
			cell: (ctx) => formatNumber(ctx.getValue()),
		}),
		helper.accessor("avgLatencyMs", {
			header: "Ср. латентность",
			cell: (ctx) => formatMs(ctx.getValue()),
		}),
	]);
	const byModel = createTable({
		features,
		columns,
		get data() {
			return data.details.usageByModel;
		},
	});
</script>

<div class="flex flex-wrap items-start justify-between gap-4">
	<div>
		<h1 class="text-2xl font-semibold">{user.displayName ?? user.externalUserId ?? "Анонимный пользователь"}</h1>
		<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
			<StatusBadge status={user.status} />
			<Badge variant="outline">{user.channel.name}</Badge>
			<Badge variant="outline">{user.kind === "anonymous" ? "анонимный" : "идентифицирован"}</Badge>
			{#if user.externalUserId}<span>id в канале: {user.externalUserId}</span>{/if}
		</div>
	</div>
	<div class="flex flex-wrap gap-2">
		{#if user.whitelistedAt}
			<form method="POST" action="?/unwhitelist" use:enhance={submitted}>
				<Button variant="outline" type="submit">Убрать из белого списка</Button>
			</form>
		{:else}
			<form method="POST" action="?/whitelist" use:enhance={submitted}>
				<Button variant="outline" type="submit">В белый список</Button>
			</form>
		{/if}
		{#if user.blockedAt}
			<form method="POST" action="?/unblock" use:enhance={submitted}>
				<Button variant="outline" type="submit">Разблокировать</Button>
			</form>
		{:else}
			<Button variant="destructive" onclick={() => (blockOpen = true)}>Заблокировать</Button>
		{/if}
	</div>
</div>

<div class="grid gap-4 md:grid-cols-4">
	<Card.Root>
		<Card.Header>
			<Card.Description>Токены (всего)</Card.Description>
			<Card.Title class="text-2xl">{formatNumber(totalTokens(user.usage))}</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			вход {formatNumber(user.usage.inputTokens)} · выход {formatNumber(user.usage.outputTokens)}
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Вызовов модели</Card.Description>
			<Card.Title class="text-2xl">{formatNumber(user.usage.calls)}</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">без usage: {user.usage.callsWithoutUsage}</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Последняя активность</Card.Description>
			<Card.Title class="text-lg">{formatDate(user.lastSeenAt)}</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">создан {formatDate(user.createdAt)}</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Header>
			<Card.Description>Доступ</Card.Description>
			<Card.Title class="text-lg">
				{user.blockedAt ? "заблокирован" : user.whitelistedAt ? "в белом списке" : "—"}
			</Card.Title>
		</Card.Header>
		<Card.Content class="text-xs text-muted-foreground">
			{#if user.blockedAt}
				{formatDate(user.blockedAt)}{user.blockedReason ? ` · ${user.blockedReason}` : ""}
			{:else if user.whitelistedAt}
				с {formatDate(user.whitelistedAt)}
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<Card.Root>
	<Card.Header><Card.Title>Расход по дням (30 дней)</Card.Title></Card.Header>
	<Card.Content><UsageChart rows={data.details.usageByDay} /></Card.Content>
</Card.Root>

<section class="grid gap-2">
	<h2 class="font-medium">Расход по моделям</h2>
	<DataTable table={byModel} />
</section>

<section class="grid gap-2">
	<div class="flex items-center justify-between">
		<h2 class="font-medium">Последние сообщения ({data.details.messages.length} из ≤10)</h2>
		{#if data.details.messages.length > 0}
			<Button variant="ghost" size="sm" onclick={() => (deleteOpen = true)}>Стереть сообщения</Button>
		{/if}
	</div>
	{#if data.details.messages.length === 0}
		<p class="text-sm text-muted-foreground">Сообщений нет.</p>
	{:else}
		<div class="h-[480px] rounded-md border">
			<SvelteVirtualChat
				messages={data.details.messages}
				getMessageId={(message: AdminMessage) => message.id}
				estimatedMessageHeight={96}
				containerClass="h-full"
				viewportClass="h-full"
				viewportLabel="Последние сообщения пользователя"
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
								<span>{formatDate(message.createdAt)}</span>
								<span>тред {message.threadId}</span>
								{#if message.usage}
									<span>
										{formatNumber(message.usage.inputTokens)} → {formatNumber(message.usage.outputTokens)} ток.,
										{formatMs(message.usage.latencyMs)}
									</span>
								{/if}
								{#if message.planRunId}
									<a class="underline" href={`/runs/${encodeURIComponent(message.planRunId)}`}>план</a>
								{/if}
							</div>
						</div>
					</div>
				{/snippet}
			</SvelteVirtualChat>
		</div>
	{/if}
</section>

<Dialog.Root bind:open={blockOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Заблокировать пользователя?</Dialog.Title>
			<Dialog.Description>Оркестратор перестанет ему отвечать — молча, модель не вызывается.</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/block" use:enhance={submitted} class="grid gap-3">
			<Input name="reason" placeholder="Причина (необязательно)" />
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (blockOpen = false)}>Отмена</Button>
				<Button variant="destructive" type="submit">Заблокировать</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Стереть сообщения пользователя?</Dialog.Title>
			<Dialog.Description>Журнал расхода токенов останется.</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/deleteMessages" use:enhance={submitted}>
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (deleteOpen = false)}>Отмена</Button>
				<Button variant="destructive" type="submit">Стереть</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
