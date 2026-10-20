<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { AdminRow } from "#lib/components/admins/admin-types.js";
	import AdminsTable from "#lib/components/admins/admins-table.svelte";
	import CreateAdminDialog from "#lib/components/admins/create-admin-dialog.svelte";
	import EditAdminDialog from "#lib/components/admins/edit-admin-dialog.svelte";
	import TokenDialog from "#lib/components/admins/token-dialog.svelte";
	import { useLiveQuery } from "#lib/live/use-live-query.svelte.js";
	import { DEFAULT_PAGE_SIZE } from "#lib/pagination.js";

	let { data } = $props();

	const live = useLiveQuery("admins", () => ({
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
	}));

	const content = useIntlayer("admins");
	let editing = $state<AdminRow | null>(null);
	let issued = $state<{ email: string; token: string; own: boolean } | null>(
		null,
	);

	// Rotating your own token ends your sessions: closing the token leads to the sign-in page.
	function closeToken() {
		const own = issued?.own;
		issued = null;
		if (own) window.location.assign("/login");
	}
</script>

<div class="flex flex-wrap items-center justify-between gap-3">
	<h1 class="text-2xl font-semibold">{$content.title.value}</h1>
	<CreateAdminDialog onIssued={(email, token) => (issued = { email, token, own: false })} />
</div>

<AdminsTable
	admins={live.current.admins}
	currentAdminId={data.admin?.id ?? null}
	currentAdminIsSuper={data.admin?.isSuper ?? false}
	pagination={{
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
		total: live.current.total,
		href: (page) => `/admins?page=${page}`,
	}}
	onEdit={(admin) => (editing = admin)}
	onIssued={(email, token, own) => (issued = { email, token, own })}
/>

<EditAdminDialog admin={editing} onClose={() => (editing = null)} />
<TokenDialog {issued} own={issued?.own ?? false} onClose={closeToken} />
