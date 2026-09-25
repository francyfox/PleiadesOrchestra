<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { RunDetails } from "$lib/api-types";
	import * as Card from "$lib/components/ui/card/index.js";
	import { traceToGraph } from "$lib/goap-graph";
	import { useFormat } from "$lib/i18n/use-format";
	import FlowGraph from "./flow-graph.svelte";

	let { details }: { details: RunDetails } = $props();

	const content = useIntlayer("goap");
	const format = useFormat();

	const graph = $derived(
		traceToGraph(details.events, details.run.goal, details.llmCalls),
	);

	type NodeStatus = keyof typeof $content.nodeStatus;
	const nodeDetails = (node: Record<string, unknown>) => {
		const status = String(node.status);
		const lines = [
			status in $content.nodeStatus
				? $content.nodeStatus[status as NodeStatus].value
				: status,
		];
		if (typeof node.cost === "number")
			lines.push(String($content.cost({ cost: node.cost })));
		if (typeof node.durationMs === "number")
			lines.push($format.ms(node.durationMs));
		const tokens = node.tokens as { input: number; output: number } | undefined;
		if (tokens) lines.push(String($content.tokens(tokens)));
		if (node.error) lines.push(String(node.error));
		return lines;
	};
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.run.plan.value}</Card.Title>
		<Card.Description>{$content.run.planHint.value}</Card.Description>
	</Card.Header>
	<Card.Content><FlowGraph {graph} details={nodeDetails} /></Card.Content>
</Card.Root>
