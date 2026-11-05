<script lang="ts">
	interface Props {
		head: string[];
		rows: (string | number)[][];
		/** Extra classes for the scroll box, e.g. a `max-h-*` for a long table. */
		class?: string;
	}
	let { head, rows, class: className = "" }: Props = $props();

	// The page resets `th`/`td` padding and borders outside any layer, hence the `!`.
	const table =
		"w-full min-w-md border-collapse text-sm [&_:is(th,td)]:border-b! [&_:is(th,td)]:border-(--dlg-rule)! [&_:is(th,td)]:py-1! [&_:is(th,td)]:pr-3! [&_:is(th,td)]:pl-0! [&_:is(th,td)]:text-left! [&_:is(th,td)]:whitespace-nowrap";
</script>

<!-- Scrolls on its own, so a wide table never widens the dialog. -->
<div class="my-2 overflow-auto {className}">
	<table class={table}>
		<thead>
			<tr>
				{#each head as cell (cell)}
					<th scope="col">{cell}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, index (index)}
				<tr>
					{#each row as cell, column (column)}
						<td>{cell}</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
