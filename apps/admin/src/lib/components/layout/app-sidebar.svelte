<script lang="ts">
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import BanIcon from "@lucide/svelte/icons/ban";
	import BotIcon from "@lucide/svelte/icons/bot";
	import BoxesIcon from "@lucide/svelte/icons/boxes";
	import BrainIcon from "@lucide/svelte/icons/brain";
	import CircleQuestionMarkIcon from "@lucide/svelte/icons/circle-question-mark";
	import CreditCardIcon from "@lucide/svelte/icons/credit-card";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import GlobeIcon from "@lucide/svelte/icons/globe";
	import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import NetworkIcon from "@lucide/svelte/icons/network";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import UserRoundIcon from "@lucide/svelte/icons/user-round";
	import UsersIcon from "@lucide/svelte/icons/users";
	import WalletIcon from "@lucide/svelte/icons/wallet";
	import { useIntlayer } from "svelte-intlayer";
	import { authActions } from "#lib/actions.js";
	import { canOpen } from "#lib/auth-redirect.js";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import { page } from "$app/state";

	let { email, level }: { email: string | null; level: number } = $props();

	const content = useIntlayer("app-sidebar");

	const nav = [
		{ href: "/", key: "dashboard", icon: ActivityIcon },
		{ href: "/visitors", key: "visitors", icon: UsersIcon },
		{ href: "/users", key: "users", icon: UserRoundIcon },
		{ href: "/flow", key: "flow", icon: NetworkIcon },
		{ href: "/intents", key: "intents", icon: BrainIcon },
		{ href: "/mcp", key: "mcp", icon: PlugIcon },
		{ href: "/agents", key: "agents", icon: BotIcon },
		{ href: "/models", key: "models", icon: BoxesIcon },
		{ href: "/performance", key: "performance", icon: GaugeIcon },
		{ href: "/recommendations", key: "recommendations", icon: LightbulbIcon },
		{ href: "/plans", key: "plans", icon: CreditCardIcon },
		{ href: "/channels", key: "channels", icon: GlobeIcon },
		{ href: "/billing", key: "billing", icon: WalletIcon },
		{ href: "/settings", key: "settings", icon: SettingsIcon },
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
					{#each nav.filter((item) => canOpen(level, item.href)) as item (item.href)}
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
