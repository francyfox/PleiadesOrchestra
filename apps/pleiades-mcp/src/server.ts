import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { decideInRounds } from "@repo/core";
import { z } from "zod";
import type { Harness } from "./harness";
import { findSite, type Site } from "./sites";

export const LIST_SITES_DESCRIPTION = `List the websites connected to Pleiades (slug and host).
Call once per session before pleiades_site_task.`;

export const SITE_TASK_DESCRIPTION = `EXPERIMENTAL. Ask the small-model assistant of a website connected to Pleiades
one plain-language question or lookup (product facts, availability, comparison).
It is one fast call instead of many browser steps, so prefer it over browsing when
the site is listed by pleiades_list_sites. It is read-only and may be wrong: it has
no live site data yet, so treat answers as unverified.

Do NOT use it for: sites that are not listed, open-ended research, login, payment,
cart changes, or reading arbitrary pages.

Input: site (slug, host or URL of a listed site), task (one plain sentence).
Output JSON: { status: "done" | "not_applicable" | "failed", answer, data? }.
If status is "not_applicable" or "failed", use the browser tools instead.`;

export const DECIDE_DESCRIPTION = `Pick ONE option out of several with the site assistant's decision model (Laya).
Use it for every choice between candidates (which product fits, which tool, which
variant): do not choose yourself. Put what the user wants in "question" and give
each candidate a short key and a one-line description (name, price, key traits).
More than 10 options are asked in rounds automatically.

Input: question (the user's need in one sentence), options ({ key: description }, at least 2).
Output JSON: { status: "done", choice, probability } or { status: "failed", answer }.
A low probability (under about 0.6) means the options are too alike: ask the user.`;

interface Deps {
	sites: Site[];
	harness: Harness;
	userId: string;
}

const json = (value: unknown, isError = false) => ({
	content: [{ type: "text" as const, text: JSON.stringify(value) }],
	isError,
});

export function createPleiadesServer({
	sites,
	harness,
	userId,
}: Deps): McpServer {
	const server = new McpServer({ name: "pleiades", version: "0.1.0" });

	server.registerTool(
		"pleiades_list_sites",
		{
			description: LIST_SITES_DESCRIPTION,
			annotations: { readOnlyHint: true },
		},
		async () => json({ sites }),
	);

	server.registerTool(
		"pleiades_site_task",
		{
			description: SITE_TASK_DESCRIPTION,
			inputSchema: {
				site: z
					.string()
					.min(1)
					.describe("Slug, host or URL of a site from pleiades_list_sites"),
				task: z.string().min(1).describe("One plain-language sentence"),
			},
			annotations: { readOnlyHint: true },
		},
		async ({ site, task }) => {
			const found = findSite(sites, site);
			if (!found) {
				return json({
					status: "not_applicable",
					answer: `"${site}" is not connected to Pleiades. Use the browser tools.`,
				});
			}
			const result = await harness.ask({
				channel: found.slug,
				threadId: `mcp-${found.slug}`,
				userId,
				text: task,
			});
			if (!result.ok)
				return json({ status: "failed", answer: result.message }, true);
			return json({
				status: "done",
				answer: result.answer,
				data: { usage: result.usage },
			});
		},
	);

	server.registerTool(
		"pleiades_decide",
		{
			description: DECIDE_DESCRIPTION,
			inputSchema: {
				question: z
					.string()
					.min(1)
					.describe("What the user wants, one sentence"),
				options: z
					.record(z.string(), z.string())
					.refine((o) => Object.keys(o).length >= 2, "at least 2 options")
					.describe("Short key to a one-line description"),
			},
			annotations: { readOnlyHint: true },
		},
		async ({ question, options }) => {
			try {
				const result = await decideInRounds(
					harness,
					{},
					{
						instructions: question,
						criteria: options,
					},
				);
				if (result.choice === undefined) {
					return json(
						{
							status: "failed",
							answer: "the decision model gave no usable answer",
						},
						true,
					);
				}
				return json({
					status: "done",
					choice: result.choice,
					probability: result.probability,
				});
			} catch (error) {
				return json(
					{
						status: "failed",
						answer: error instanceof Error ? error.message : String(error),
					},
					true,
				);
			}
		},
	);

	return server;
}
