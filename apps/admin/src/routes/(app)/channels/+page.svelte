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
	import type { Channel } from "$lib/api-types";
	import DataTable from "$lib/components/data-table.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import { formatDate } from "$lib/format";

	let { data, form } = $props();

	let editing = $state<Channel | null>(null);

	const submitted: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === "failure")
				toast.error(String(result.data?.message ?? "Ошибка"));
			else if (result.type === "success" && !result.data?.secret)
				toast.success("Сохранено");
			editing = null;
			await update({ reset: result.type === "success" });
		};
	};

	const selectClass =
		"h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, Channel>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", {
				header: "Канал",
				cell: (ctx) => renderSnippet(nameCell, ctx.row.original),
			}),
			helper.accessor("kind", { header: "Тип" }),
			helper.accessor("accessMode", {
				header: "Доступ",
				cell: (ctx) =>
					ctx.getValue() === "whitelist" ? "белый список" : "открытый",
			}),
			helper.accessor("allowedOrigins", {
				header: "Домены",
				cell: (ctx) =>
					ctx.getValue().length ? ctx.getValue().join(", ") : "—",
			}),
			helper.accessor("publishableKey", {
				header: "Publishable key",
				cell: (ctx) => ctx.getValue() ?? "—",
			}),
			helper.accessor("createdAt", {
				header: "Создан",
				cell: (ctx) => formatDate(ctx.getValue()),
			}),
			helper.display({
				id: "actions",
				cell: (ctx) => renderSnippet(actions, ctx.row.original),
			}),
		]),
		get data() {
			return data.channels;
		},
	});
</script>

{#snippet nameCell(channel: Channel)}
	<div class="font-medium">{channel.name}</div>
	<div class="text-xs text-muted-foreground">{channel.slug}</div>
	{#if channel.disabledAt}<Badge variant="destructive">отключён</Badge>{/if}
{/snippet}

{#snippet actions(channel: Channel)}
	<div class="flex justify-end gap-1">
		<Button size="sm" variant="ghost" onclick={() => (editing = channel)}>Изменить</Button>
		<form method="POST" action="?/toggle" use:enhance={submitted}>
			<input type="hidden" name="id" value={channel.id} />
			<input type="hidden" name="disabled" value={channel.disabledAt ? "false" : "true"} />
			<Button size="sm" variant="ghost" type="submit">{channel.disabledAt ? "Включить" : "Отключить"}</Button>
		</form>
		{#if channel.kind === "web"}
			<form method="POST" action="?/rotate" use:enhance={submitted}>
				<input type="hidden" name="id" value={channel.id} />
				<Button size="sm" variant="ghost" type="submit">Новые ключи</Button>
			</form>
		{/if}
	</div>
{/snippet}

<h1 class="text-2xl font-semibold">Каналы</h1>

{#if form?.secret}
	<Card.Root class="border-amber-500">
		<Card.Header>
			<Card.Title>Ключи канала «{form.secret.channel}»</Card.Title>
			<Card.Description>Секретный ключ показывается один раз — сохраните его сейчас.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-1 font-mono text-sm break-all">
			<div>publishable: {form.secret.publishableKey}</div>
			<div>secret: {form.secret.secretKey}</div>
		</Card.Content>
	</Card.Root>
{/if}

<DataTable {table} emptyText="Каналов нет" />

<Card.Root>
	<Card.Header>
		<Card.Title>Новый веб-канал (сайт магазина)</Card.Title>
		<Card.Description>Telegram и CLI создаются миграцией оркестратора.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/create" use:enhance={submitted} class="grid max-w-xl gap-3">
			<div class="grid gap-1"><Label for="slug">Slug</Label><Input id="slug" name="slug" placeholder="shop-foo" required /></div>
			<div class="grid gap-1"><Label for="name">Название</Label><Input id="name" name="name" required /></div>
			<div class="grid gap-1">
				<Label for="accessMode">Доступ</Label>
				<select id="accessMode" name="accessMode" class={selectClass}>
					<option value="open">Открытый</option>
					<option value="whitelist">Белый список</option>
				</select>
			</div>
			<div class="grid gap-1">
				<Label for="allowedOrigins">Разрешённые домены (по одному в строке)</Label>
				<Textarea id="allowedOrigins" name="allowedOrigins" placeholder="https://shop.example" />
			</div>
			<Button type="submit" class="w-fit">Создать</Button>
		</form>
	</Card.Content>
</Card.Root>

<Dialog.Root open={editing !== null} onOpenChange={(open) => { if (!open) editing = null; }}>
	<Dialog.Content>
		{#if editing}
			<Dialog.Header><Dialog.Title>Канал «{editing.name}»</Dialog.Title></Dialog.Header>
			<form method="POST" action="?/update" use:enhance={submitted} class="grid gap-3">
				<input type="hidden" name="id" value={editing.id} />
				<div class="grid gap-1"><Label for="edit-name">Название</Label><Input id="edit-name" name="name" value={editing.name} /></div>
				<div class="grid gap-1">
					<Label for="edit-access">Доступ</Label>
					<select id="edit-access" name="accessMode" class={selectClass} value={editing.accessMode}>
						<option value="open">Открытый</option>
						<option value="whitelist">Белый список</option>
					</select>
				</div>
				{#if editing.kind === "web"}
					<div class="grid gap-1">
						<Label for="edit-origins">Разрешённые домены</Label>
						<Textarea id="edit-origins" name="allowedOrigins" value={editing.allowedOrigins.join("\n")} />
					</div>
				{/if}
				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={() => (editing = null)}>Отмена</Button>
					<Button type="submit">Сохранить</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
