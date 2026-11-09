// Same limits as alpha-orchestrator's `guardrails.service.ts`, which stays the judge on save.
const MAX_RULES = 500;
const MAX_RULE_CHARS = 500;

export interface RuleLineError {
	line: number;
	message: string;
}

/** What the server would reject, per 1-based line: a regex that does not compile, a long line, a 501st rule. */
export function ruleErrors(text: string): RuleLineError[] {
	const errors: RuleLineError[] = [];
	let rules = 0;
	for (const [index, raw] of text.split(/\r?\n/).entries()) {
		const source = raw.trim();
		if (!source || source.startsWith("#")) continue;
		const line = index + 1;
		if (source.length > MAX_RULE_CHARS) {
			errors.push({
				line,
				message: `Longer than ${MAX_RULE_CHARS} characters`,
			});
		} else if (rules >= MAX_RULES) {
			errors.push({ line, message: `More than ${MAX_RULES} rules` });
		} else {
			try {
				new RegExp(source, "i");
				rules++;
			} catch (error) {
				errors.push({ line, message: (error as Error).message });
			}
		}
	}
	return errors;
}
