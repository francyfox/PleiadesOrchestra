<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import BanIcon from "@lucide/svelte/icons/ban";
	import BellIcon from "@lucide/svelte/icons/bell";
	import BotIcon from "@lucide/svelte/icons/bot";
	import BoxesIcon from "@lucide/svelte/icons/boxes";
	import BrainIcon from "@lucide/svelte/icons/brain";
	import CircleQuestionMarkIcon from "@lucide/svelte/icons/circle-question-mark";
	import CreditCardIcon from "@lucide/svelte/icons/credit-card";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import GlobeIcon from "@lucide/svelte/icons/globe";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import NetworkIcon from "@lucide/svelte/icons/network";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
	import UserRoundIcon from "@lucide/svelte/icons/user-round";
	import UsersIcon from "@lucide/svelte/icons/users";
	import WalletIcon from "@lucide/svelte/icons/wallet";
	import { useIntlayer } from "svelte-intlayer";
	import { authActions } from "#lib/actions.js";
	import SidebarStanding from "#lib/components/billing/sidebar-standing.svelte";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import { allows, isStaff } from "#lib/guards.js";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	let { email, level }: { email: string | null; level: number } = $props();

	const content = useIntlayer("app-sidebar");

	// `audience` mirrors the route group the page lives in: (shared) = all, (staff), (customer).
	const nav = [
		{
			href: resolve(""),
			key: "dashboard",
			icon: ActivityIcon,
			audience: "all",
		},
		{
			href: resolve("visitors"),
			key: "visitors",
			icon: UsersIcon,
			audience: "all",
		},
		{
			href: resolve("users"),
			key: "users",
			icon: UserRoundIcon,
			audience: "staff",
		},
		{ href: resolve("flow"), key: "flow", icon: NetworkIcon, audience: "all" },
		{
			href: resolve("intents"),
			key: "intents",
			icon: BrainIcon,
			audience: "staff",
		},
		{ href: resolve("mcp"), key: "mcp", icon: PlugIcon, audience: "staff" },
		{
			href: resolve("agents"),
			key: "agents",
			icon: BotIcon,
			audience: "staff",
		},
		{
			href: resolve("models"),
			key: "models",
			icon: BoxesIcon,
			audience: "staff",
		},
		{
			href: resolve("guardrails"),
			key: "guardrails",
			icon: ShieldAlertIcon,
			audience: "staff",
		},
		{
			href: resolve("performance"),
			key: "performance",
			icon: GaugeIcon,
			audience: "staff",
		},
		{
			href: resolve("plans"),
			key: "plans",
			icon: CreditCardIcon,
			audience: "staff",
		},
		{
			href: resolve("channels"),
			key: "channels",
			icon: GlobeIcon,
			audience: "all",
		},
		{
			href: resolve("billing"),
			key: "billing",
			icon: WalletIcon,
			audience: "customer",
		},
		{
			href: resolve("settings"),
			key: "settings",
			icon: SettingsIcon,
			audience: "customer",
		},
		{
			href: resolve("preferences"),
			key: "settings",
			icon: SettingsIcon,
			audience: "staff",
		},
		{
			href: resolve("blocked-ips"),
			key: "blockedIps",
			icon: BanIcon,
			audience: "all",
		},
		{
			href: resolve("notifications"),
			key: "notifications",
			icon: BellIcon,
			audience: "all",
		},
		{
			href: resolve("admins"),
			key: "admins",
			icon: ShieldIcon,
			audience: "staff",
		},
		{
			href: resolve("faq"),
			key: "faq",
			icon: CircleQuestionMarkIcon,
			audience: "all",
		},
	] as const;

	/** A full page load, not `goto`: drops every in-memory trace of the session. */
	async function logout() {
		await authActions.logout();
		window.location.assign(resolve(isStaff(level) ? "login" : "user/login"));
	}

	const isActive = (href: string) =>
		href === resolve("")
			? page.url.pathname === href
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
					{#each nav.filter((item) => allows(item.audience, level)) as item (item.href)}
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
		{#if !isStaff(level)}<SidebarStanding />{/if}
		<div class="px-2 text-md text-muted-foreground">{email}</div>
		<Sidebar.MenuButton>
			{#snippet child({ props })}
				<button type="button" onclick={logout} {...props}><LogOutIcon /><span>{$content.logout.value}</span></button>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.Footer>
</Sidebar.Root>
