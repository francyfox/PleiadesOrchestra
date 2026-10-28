export { intentFromCues } from "@repo/intent-presets";
export { pruneUnproducibleFacts } from "#core/goap/catalog";
export type { DecisionActionConfig } from "#core/goap/decision-action";
export { createDecisionAction } from "#core/goap/decision-action";
export type { RunPlanOptions, RunPlanResult } from "#core/goap/executor";
export { runPlan } from "#core/goap/executor";
export type {
	IntentExample,
	IntentHit,
	IntentModel,
} from "#core/goap/intent-memory";
export {
	createIntentModel,
	normalizeIntentText,
} from "#core/goap/intent-memory";
export type { Taxonomy, ToolIntent } from "#core/goap/intent-taxonomy";
export {
	decompositionDescriptions,
	EFFECTS_BY_INTENT,
	effectsOf,
	INTENT_DESCRIPTIONS,
	intentIds,
	layaDescriptions,
	needsTheWords,
	PRECONDITIONS_BY_INTENT,
	preconditionsOf,
	SESSION_FACTS,
	TOOL_INTENTS,
} from "#core/goap/intent-taxonomy";
export {
	bindListScope,
	LIST_EMPTY,
	LIST_READ,
	LISTED_ITEMS,
	REMOVED_ITEMS,
	SCOPE_ALL,
	scopeFacts,
} from "#core/goap/list-removal";
export type { StdioMcpClientConfig } from "#core/goap/mcp-client";
export { connectStdioMcpClient } from "#core/goap/mcp-client";
export type {
	ClassifyMessageIntentConfig,
	IntentSource,
	IntentVerdict,
	MessageIntent,
} from "#core/goap/message-intent";
export {
	classifyMessageIntent,
	classifyMessageIntentDetailed,
	goalForIntent,
	NEEDS_THE_WORDS,
} from "#core/goap/message-intent";
export type { ParsedPage } from "#core/goap/page";
export {
	PAGE_FACT,
	PAGE_LANG_FACT,
	parsePage,
	samePage,
} from "#core/goap/page";
export { plan } from "#core/goap/plan";
export type {
	ProductRequest,
	ProductRequestActionConfig,
} from "#core/goap/product-request";
export {
	createProductRequestAction,
	namesNoProduct,
	parseProductRequest,
	reuseLastProduct,
} from "#core/goap/product-request";
export type { RunLock } from "#core/goap/run-lock";
export { createRunLock } from "#core/goap/run-lock";
export type { ListItem } from "#core/goap/shopping-list";
export {
	FOUND_ITEMS,
	itemsText,
	MISSING_ITEMS,
	REQUESTED_ITEMS,
	readItems,
} from "#core/goap/shopping-list";
export { matchSpecialist, preferSpecialist } from "#core/goap/specialist";
export type { StepLanguage } from "#core/goap/step-text";
export { stepLanguage } from "#core/goap/step-text";
export type { DecomposedTask } from "#core/goap/task-decomposition";
export {
	decomposeMessage,
	hasOrderWord,
	looksLikeSeveralTasks,
	mustAskOrder,
	runnableTasks,
} from "#core/goap/task-decomposition";
export type {
	StreamingContext,
	TextActionConfig,
	TextActionMeta,
} from "#core/goap/text-action";
export { createTextAction } from "#core/goap/text-action";
export type { ToolChoice, ToolOption } from "#core/goap/tool-choice";
export { chooseTool } from "#core/goap/tool-choice";
export type {
	McpCallToolResult,
	McpClient,
	McpToolDescriptor,
	McpToolSourceConfig,
	ToolSource,
} from "#core/goap/tool-source";
export { createMcpToolSource } from "#core/goap/tool-source";
export type {
	ActionContext,
	ActionResult,
	BaseContext,
	Goal,
	GoapAction,
	PlanStep,
	PlanTraceEvent,
	PlanTracer,
	StepPhase,
	WaitingOn,
	WorldState,
} from "#core/goap/types";
export type {
	Understanding,
	UnderstoodAttribute,
	UnderstoodItem,
	UnderstoodTask,
} from "#core/goap/understanding";
export {
	attributeFacts,
	STATED_ATTRIBUTES,
	TIME_ZONE_FACT,
	TODAY_FACT,
	translateTexts,
	understandMessage,
} from "#core/goap/understanding";
export type {
	CreateWebMcpActionsConfig,
	WebMcpToolCallPayload,
	WebMcpToolDescriptor,
} from "#core/goap/webmcp-actions";
export {
	createWebMcpActions,
	firstListedProductName,
	MAX_TOOL_TEXT_CHARS,
	MISSING_PARAMS,
} from "#core/goap/webmcp-actions";
export type {
	WorldStateCheckpoint,
	WorldStateStore,
} from "#core/goap/world-state-store";
export { InMemoryWorldStateStore } from "#core/goap/world-state-store";
