<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { authActions } from "#lib/actions.js";
	import { Button } from "#lib/components/ui/button/index.js";

	/**
	 * "Send the email again" for an unverified address. Locked for a minute
	 * after each send: admin-api drops anything sooner anyway (MAIL_COOLDOWN_MS).
	 */
	let { email }: { email: string } = $props();

	const COOLDOWN_S = 60;
	const content = useIntlayer("auth");
	let left = $state(COOLDOWN_S);
	let pending = $state(false);

	$effect(() => {
		if (left <= 0) return;
		const timer = setTimeout(() => left--, 1000);
		return () => clearTimeout(timer);
	});

	async function resend() {
		pending = true;
		await authActions.resend(email);
		pending = false;
		left = COOLDOWN_S;
	}
</script>

<Button type="button" variant="outline" class="w-full" disabled={left > 0 || pending || !email} onclick={resend}>
	{left > 0 ? $content.resend.wait({ seconds: left }) : $content.resend.button.value}
</Button>
