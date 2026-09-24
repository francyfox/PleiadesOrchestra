<script lang="ts">
	import { enhance } from "$app/forms";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";

	let { form } = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Первый администратор</Card.Title>
		<Card.Description>
			Администраторов ещё нет. Эта учётная запись станет первой; после неё регистрация закроется,
			и новых администраторов можно будет создать только из админки.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance class="grid gap-4">
			<div class="grid gap-2">
				<Label for="name">Имя</Label>
				<Input id="name" name="name" autocomplete="name" value={form?.name ?? ""} />
			</div>
			<div class="grid gap-2">
				<Label for="email">Почта</Label>
				<Input id="email" name="email" type="email" autocomplete="email" required value={form?.email ?? ""} />
			</div>
			<div class="grid gap-2">
				<Label for="password">Пароль</Label>
				<Input id="password" name="password" type="password" autocomplete="new-password" minlength={8} required />
			</div>
			{#if form?.message}
				<p class="text-sm text-destructive">{form.message}</p>
			{/if}
			<Button type="submit" class="w-full">Создать и войти</Button>
		</form>
	</Card.Content>
</Card.Root>
