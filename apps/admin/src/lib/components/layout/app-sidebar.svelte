<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import BanIcon from "@lucide/svelte/icons/ban";
	import BotIcon from "@lucide/svelte/icons/bot";
	import CircleQuestionMarkIcon from "@lucide/svelte/icons/circle-question-mark";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import GlobeIcon from "@lucide/svelte/icons/globe";
	import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import NetworkIcon from "@lucide/svelte/icons/network";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import UsersIcon from "@lucide/svelte/icons/users";
	import { useIntlayer } from "svelte-intlayer";
	import { page } from "$app/state";
	import { authActions } from "$lib/actions";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";

	let { email }: { email: string | null } = $props();

	const content = useIntlayer("app-sidebar");

	const nav = [
		{ href: "/", key: "dashboard", icon: ActivityIcon },
		{ href: "/users", key: "users", icon: UsersIcon },
		{ href: "/flow", key: "flow", icon: NetworkIcon },
		{ href: "/mcp", key: "mcp", icon: PlugIcon },
		{ href: "/agents", key: "agents", icon: BotIcon },
		{ href: "/performance", key: "performance", icon: GaugeIcon },
		{ href: "/recommendations", key: "recommendations", icon: LightbulbIcon },
		{ href: "/channels", key: "channels", icon: GlobeIcon },
		{ href: "/blocked-ips", key: "blockedIps", icon: BanIcon },
		{ href: "/admins", key: "admins", icon: ShieldIcon },
		{ href: "/faq", key: "faq", icon: CircleQuestionMarkIcon },
	] as const;

	/** A full page load, not `goto`: drops every in-memory trace of the session. */
	async function logout() {
		await authActions.logout();
		window.location.assign("/login");
	}

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
		<Sidebar.MenuButton>
			{#snippet child({ props })}
				<button type="button" onclick={logout} {...props}><LogOutIcon /><span>{$content.logout.value}</span></button>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.Footer>
</Sidebar.Root>
