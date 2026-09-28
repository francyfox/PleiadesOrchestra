/** The questions in reading order; each has `items.<id>.q` / `.a` in faq.content.ts. */
export const FAQ_IDS = [
	"keys",
	"agentUrl",
	"silent",
	"noConnection",
	"noDelete",
	"access",
	"ipBlocks",
	"superAdmin",
] as const;

export type FaqId = (typeof FAQ_IDS)[number];
