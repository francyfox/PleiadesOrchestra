<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import BanIcon from "@lucide/svelte/icons/ban";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import GlobeIcon from "@lucide/svelte/icons/globe";
	import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import NetworkIcon from "@lucide/svelte/icons/network";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import UsersIcon from "@lucide/svelte/icons/users";
	import { useIntlayer } from "svelte-intlayer";
	import { page } from "$app/state";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";

	let { email }: { email: string | null } = $props();

	const content = useIntlayer("app-sidebar");

	const nav = [
		{ href: "/", key: "dashboard", icon: ActivityIcon },
		{ href: "/users", key: "users", icon: UsersIcon },
		{ href: "/goap/actions", key: "goap", icon: NetworkIcon },
		{ href: "/performance", key: "performance", icon: GaugeIcon },
		{ href: "/recommendations", key: "recommendations", icon: LightbulbIcon },
		{ href: "/channels", key: "channels", icon: GlobeIcon },
		{ href: "/blocked-ips", key: "blockedIps", icon: BanIcon },
		{ href: "/admins", key: "admins", icon: ShieldIcon },
	] as const;

	const isActive = (href: string) =>
		href === "/"
			? page.url.pathname === "/"
			: page.url.pathname.startsWith(href);
</script>

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
										<span>{$content.nav[item.key].value}</span>
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
		<div class="px-2 text-xs text-muted-foreground">{email}</div>
		<form method="POST" action="/logout">
			<Sidebar.MenuButton>
				{#snippet child({ props })}
					<button type="submit" {...props}><LogOutIcon /><span>{$content.logout.value}</span></button>
				{/snippet}
			</Sidebar.MenuButton>
		</form>
	</Sidebar.Footer>
</Sidebar.Root>
