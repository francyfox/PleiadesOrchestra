<script lang="ts">
	import * as Sentry from "@sentry/sveltekit";
	import { mode } from "mode-watcher";
	import { useIntlayer } from "svelte-intlayer";

	/**
	 * Sentry's "report a problem" button, bottom right (the sidebar's sign-out sits bottom left).
	 * Rebuilt on a locale switch: the widget takes its texts once. Renders
	 * nothing without a DSN (hooks.client.ts didn't start Sentry).
	 */
	let { user }: { user: { id: string; email: string; name: string } | null } =
		$props();

	const content = useIntlayer("feedback-widget");

	$effect(() => {
		Sentry.setUser(
			user && { id: user.id, email: user.email, username: user.name },
		);
	});

	$effect(() => {
		Sentry.getFeedback()?.setTheme(mode.current === "dark" ? "dark" : "light");
	});

	$effect(() => {
		const feedback = Sentry.getFeedback();
		if (!feedback) return;
		const texts = Object.fromEntries(
			Object.entries($content).map(([key, text]) => [
				key,
				(text as { value: string }).value,
			]),
		);
		const widget = feedback.createWidget(texts);
		return () => widget.removeFromDom();
	});
</script>

<svelte:head>
	<style>
		#sentry-feedback {
			--actor-inset: auto 1rem 1rem auto;
		}
	</style>
</svelte:head>
