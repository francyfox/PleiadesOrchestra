import type {
	Agent,
	DecisionAgent,
	FunctionCallAgent,
	GoapAction,
	RunLock,
	UsageRecorder,
	WorldStateStore,
} from "@repo/core";
import type { ActiveRuns } from "../active-runs/active-runs.ts";
import type { Db } from "../database/database.ts";
import type { IntentMemory } from "../intents/intents.service.ts";
import type { RunBinding } from "../run-binding/run-binding.ts";

export interface ReplyDeps {
	db: Db;
	agent: Agent;
	decisionAgent: DecisionAgent;
	/** Text model with the "reply with {query, quantity} JSON" prompt; without it a task has no `query`/`quantity` facts. */
	productRequestAgent?: Agent;
	/** The language the channel's site writes its catalog in (`en` when unknown). */
	catalogLanguage?: (channelId: string) => string | undefined;
	/** What each site's classifier has been taught; asked before Laya. */
	intentMemory?: IntentMemory;
	/** Translates a message that is not English; absent when no translator is loaded. */
	translate?: (text: string) => string;
	/** `delta-function-call`: fills in WebMCP tool arguments as JSON; unset = built from facts. */
	functionCallAgent?: FunctionCallAgent;
	/** The static GOAP catalog (`buildActions`). */
	actions: GoapAction[];
	/** Shared with the history store / usage recorder so their writes get linked to the running plan. */
	runs: RunBinding;
	/** Persists a thread's `WorldState` between `runPlan` calls so a stopped run can resume. */
	worldStateStore: WorldStateStore;
	/** Serializes `runPlan` calls that share a `threadId`. */
	runLock: RunLock;
	/** Runs executing right now, shared with the admin routes. */
	activeRuns?: ActiveRuns;
	/** Classified WebMCP actions per thread, registered when the widget's panel opens. */
	webmcpCatalog: Map<string, GoapAction[]>;
	/**
	 * Extra actions for one thread, resolved per request (e.g. an MCP tool
	 * catalog bound to a live browser session — it can't live in the shared
	 * static catalog).
	 */
	threadActionsFor?: (threadId: string) => Promise<GoapAction[]> | GoapAction[];
	usageRecorder?: { flush(): void; record?: UsageRecorder["record"] };
	now: () => number;
	onError?: (error: unknown) => void;
}
