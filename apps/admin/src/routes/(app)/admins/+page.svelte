<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { AdminRow } from "$lib/components/admins/admin-types";
	import AdminsTable from "$lib/components/admins/admins-table.svelte";
	import CreateAdminForm from "$lib/components/admins/create-admin-form.svelte";
	import SetPasswordDialog from "$lib/components/admins/set-password-dialog.svelte";
	import { DEFAULT_PAGE_SIZE } from "$lib/pagination";

	let { data } = $props();

	const content = useIntlayer("admins");
	let passwordFor = $state<AdminRow | null>(null);
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<AdminsTable
	admins={data.admins}
	currentAdminId={data.admin?.id ?? null}
	currentAdminIsSuper={data.admin?.isSuper ?? false}
	pagination={{
		page: data.page,
		pageSize: DEFAULT_PAGE_SIZE,
		total: data.total,
		href: (page) => `/admins?page=${page}`,
	}}
	onChangePassword={(admin) => (passwordFor = admin)}
/>

<CreateAdminForm />

<SetPasswordDialog admin={passwordFor} onClose={() => (passwordFor = null)} />
