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
	import DataTable from "$lib/components/data-table.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { formatDate } from "$lib/format";

	let { data } = $props();

	type AdminRow = (typeof data.admins)[number];

	let passwordFor = $state<AdminRow | null>(null);

	const submitted: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === "failure")
				toast.error(String(result.data?.message ?? "Ошибка"));
			else if (result.type === "success") toast.success("Готово");
			passwordFor = null;
			await update({ reset: result.type === "success" });
		};
	};

	const features = tableFeatures({});
	const helper = createColumnHelper<typeof features, AdminRow>();
	const table = createTable({
		features,
		columns: helper.columns([
			helper.accessor("name", { header: "Имя" }),
			helper.accessor("email", { header: "Почта" }),
			helper.accessor("banned", {
				header: "Статус",
				cell: (ctx) => renderSnippet(status, ctx.row.original),
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
			return data.admins;
		},
	});
</script>

{#snippet status(admin: AdminRow)}
	{#if admin.banned}
		<Badge variant="destructive">заблокирован</Badge>
		{#if admin.banReason}<span class="ml-1 text-xs text-muted-foreground">{admin.banReason}</span>{/if}
	{:else}
		<Badge variant="outline">активен</Badge>
	{/if}
{/snippet}

{#snippet actions(admin: AdminRow)}
	<div class="flex justify-end gap-1">
		<Button size="sm" variant="ghost" onclick={() => (passwordFor = admin)}>Сменить пароль</Button>
		{#if admin.banned}
			<form method="POST" action="?/unban" use:enhance={submitted}>
				<input type="hidden" name="id" value={admin.id} />
				<Button size="sm" variant="outline" type="submit">Разблокировать</Button>
			</form>
		{:else if admin.id !== data.admin?.id}
			<form method="POST" action="?/ban" use:enhance={submitted}>
				<input type="hidden" name="id" value={admin.id} />
				<input type="hidden" name="banned" value="false" />
				<Button size="sm" variant="ghost" type="submit">Заблокировать</Button>
			</form>
		{/if}
	</div>
{/snippet}

<h1 class="text-2xl font-semibold">Администраторы</h1>

<DataTable {table} />

<Card.Root>
	<Card.Header>
		<Card.Title>Новый администратор</Card.Title>
		<Card.Description>Публичная регистрация закрыта — новые учётные записи создаются только здесь.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/create" use:enhance={submitted} class="grid max-w-xl gap-3">
			<div class="grid gap-1"><Label for="new-name">Имя</Label><Input id="new-name" name="name" /></div>
			<div class="grid gap-1"><Label for="new-email">Почта</Label><Input id="new-email" name="email" type="email" required /></div>
			<div class="grid gap-1">
				<Label for="new-password">Временный пароль</Label>
				<Input id="new-password" name="password" type="password" minlength={8} autocomplete="new-password" required />
			</div>
			<Button type="submit" class="w-fit">Создать</Button>
		</form>
	</Card.Content>
</Card.Root>

<Dialog.Root open={passwordFor !== null} onOpenChange={(open) => { if (!open) passwordFor = null; }}>
	<Dialog.Content>
		{#if passwordFor}
			<Dialog.Header><Dialog.Title>Новый пароль для {passwordFor.email}</Dialog.Title></Dialog.Header>
			<form method="POST" action="?/setPassword" use:enhance={submitted} class="grid gap-3">
				<input type="hidden" name="id" value={passwordFor.id} />
				<Input name="password" type="password" minlength={8} autocomplete="new-password" required />
				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={() => (passwordFor = null)}>Отмена</Button>
					<Button type="submit">Сохранить</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
