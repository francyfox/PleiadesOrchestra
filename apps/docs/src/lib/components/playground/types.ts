export type McpTool = {
	name: string;
	description: string;
	annotations?: { readOnlyHint?: boolean };
};

export type GraphNode = {
	id: string;
	label: string;
	x: number;
	y: number;
	active: boolean;
	nodeStatus?: "running" | "done" | "error";
};

export type GraphEdge = { from: string; to: string };
