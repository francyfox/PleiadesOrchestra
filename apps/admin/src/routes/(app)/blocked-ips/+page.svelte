<script lang="ts">
	import type { SubmitFunction } from "@sveltejs/kit";
	import {
		createColumnHelper,
		createTable,
		renderSnippet,
		tableFeatures,
	} from "@tanstack/svelte-table";
	import { toast } from "svelte-sonner";
	import { enhance } from "$app/forms";
	import type { BlockedIp } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { formatDate } from "$lib/format";

	let { data } = $props();

	const submitted: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === "failure")
				toast.error(String(result.data?.message ?? "Ошибка"));
			else if (result.type === "success") toast.success("Готово");
			await update();
		};
	};

	const channelName = (id: string | null) =>
		id
			? (data.channels.find((channel) => channel.id === id)?.name ?? id)
			: "все каналы";

	const selectClass =
		"h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, BlockedIp>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("ipHash", {
				header: "Хеш IP",
				cell: (ctx) => `${ctx.getValue().slice(0, 16)}…`,
			}),
			helper.accessor("channelId", {
				header: "Канал",
				cell: (ctx) => channelName(ctx.getValue()),
			}),
			helper.accessor("reason", { header: "Причина" }),
			helper.accessor("createdAt", {
				header: "Создана",
				cell: (ctx) => formatDate(ctx.getValue()),
			}),
			helper.accessor("expiresAt", {
				header: "Истекает",
				cell: (ctx) => formatDate(ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				cell: (ctx) => renderSnippet(remove, ctx.row.original),
			}),
		]),
		get data() {
			return data.items;
		},
	});
</script>

{#snippet remove(item: BlockedIp)}
	<form method="POST" action="?/delete" use:enhance={submitted} class="flex justify-end">
		<input type="hidden" name="id" value={item.id} />
		<Button size="sm" variant="ghost" type="submit">Снять</Button>
	</form>
{/snippet}

<h1 class="text-2xl font-semibold">Блокировки по IP</h1>
<p class="text-sm text-muted-foreground">
	Для анонимных посетителей веб-каналов. IP хранится только как хеш; срок обязателен — адреса бывают общими.
</p>

<DataTable {table} emptyText="Блокировок нет" />

<Card.Root>
	<Card.Header><Card.Title>Заблокировать IP</Card.Title></Card.Header>
	<Card.Content>
		<form method="POST" action="?/create" use:enhance={submitted} class="grid max-w-xl gap-3">
			<div class="grid gap-1"><Label for="ip">IP-адрес</Label><Input id="ip" name="ip" required /></div>
			<div class="grid gap-1"><Label for="reason">Причина</Label><Input id="reason" name="reason" required /></div>
			<div class="grid gap-1">
				<Label for="expires">Срок, часов</Label>
				<Input id="expires" name="expiresInHours" type="number" min="1" value="24" required />
			</div>
			<div class="grid gap-1">
				<Label for="channel">Канал</Label>
				<select id="channel" name="channelId" class={selectClass}>
					<option value="">Все каналы</option>
					{#each data.channels.filter((channel) => channel.kind === "web") as channel (channel.id)}
						<option value={channel.id}>{channel.name}</option>
					{/each}
				</select>
			</div>
			<Button type="submit" class="w-fit">Заблокировать</Button>
		</form>
	</Card.Content>
</Card.Root>
