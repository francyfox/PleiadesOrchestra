<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import BanIcon from "@lucide/svelte/icons/ban";
	import GlobeIcon from "@lucide/svelte/icons/globe";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import NetworkIcon from "@lucide/svelte/icons/network";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import UsersIcon from "@lucide/svelte/icons/users";
	import { page } from "$app/state";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";

	let { data, children } = $props();

	const nav = [
		{ href: "/", label: "Дашборд", icon: ActivityIcon },
		{ href: "/users", label: "Пользователи", icon: UsersIcon },
		{ href: "/goap/actions", label: "GOAP-действия", icon: NetworkIcon },
		{ href: "/channels", label: "Каналы", icon: GlobeIcon },
		{ href: "/blocked-ips", label: "Блокировки IP", icon: BanIcon },
		{ href: "/admins", label: "Администраторы", icon: ShieldIcon },
	];

	const isActive = (href: string) =>
		href === "/"
			? page.url.pathname === "/"
			: page.url.pathname.startsWith(href);
</script>

<Sidebar.Provider>
	<Sidebar.Root>
		<Sidebar.Header>
			<div class="px-2 py-1.5 text-sm font-semibold">Pleiades</div>
		</Sidebar.Header>
		<Sidebar.Content>
			<Sidebar.Group>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each nav as item (item.href)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={isActive(item.href)}>
									{#snippet child({ props })}
										<a href={item.href} {...props}>
											<item.icon />
											<span>{item.label}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		</Sidebar.Content>
		<Sidebar.Footer>
			<div class="px-2 text-xs text-muted-foreground">{data.admin?.email}</div>
			<form method="POST" action="/logout">
				<Sidebar.MenuButton>
					{#snippet child({ props })}
						<button type="submit" {...props}><LogOutIcon /><span>Выйти</span></button>
					{/snippet}
				</Sidebar.MenuButton>
			</form>
		</Sidebar.Footer>
	</Sidebar.Root>
	<Sidebar.Inset>
		<header class="flex h-12 items-center gap-2 border-b px-4">
			<Sidebar.Trigger />
		</header>
		<main class="flex flex-col gap-6 p-4 md:p-6">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
