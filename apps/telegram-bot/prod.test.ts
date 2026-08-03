import { describe, expect, test } from "bun:test";
import { $ } from "bun";

interface ServiceInstance {
	serviceName: string;
	latestDeployment?: { status: string };
	activeDeployments?: { instances?: { status: string }[] }[];
}

async function getServices(): Promise<ServiceInstance[]> {
	const output = await $`railway status --json`.text();
	const status = JSON.parse(output);
	return status.environments.edges.flatMap(
		(e: {
			node: { serviceInstances: { edges: { node: ServiceInstance }[] } };
		}) => e.node.serviceInstances.edges.map((s) => s.node),
	);
}

describe("telegram-bot (prod)", () => {
	// No HTTP surface (long polling) — the only externally observable signal
	// is Railway's own deployment/instance status.
	test("latest Railway deployment is running", async () => {
		const services = await getServices();
		const service = services.find((s) => s.serviceName === "telegram-bot");

		expect(service).toBeTruthy();
		expect(service?.latestDeployment?.status).toBe("SUCCESS");
		expect(service?.activeDeployments?.[0]?.instances?.[0]?.status).toBe(
			"RUNNING",
		);
	}, 15_000);
});
