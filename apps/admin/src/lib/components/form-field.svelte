<script lang="ts">
	import type { FullAutoFill, HTMLInputTypeAttribute } from "svelte/elements";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";

	/**
	 * Label + input pair used by every form in the admin. An explicit prop
	 * list rather than spreading Input's props: its type is a union too
	 * complex for svelte-check to forward.
	 */
	let {
		id,
		label,
		name = id,
		type = "text",
		value = "",
		placeholder,
		autocomplete,
		required = false,
		minlength,
		min,
	}: {
		id: string;
		label: string;
		name?: string;
		type?: HTMLInputTypeAttribute;
		value?: string | number;
		placeholder?: string;
		autocomplete?: FullAutoFill;
		required?: boolean;
		minlength?: number;
		min?: number;
	} = $props();
</script>

<div class="grid gap-2">
	<Label for={id}>{label}</Label>
	<Input {id} {name} {type} {value} {placeholder} {autocomplete} {required} {minlength} {min} />
</div>
