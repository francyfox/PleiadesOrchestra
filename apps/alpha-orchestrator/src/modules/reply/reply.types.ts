import type {
	Agent,
	DecisionAgent,
	GoapAction,
	RunLock,
	WorldStateStore,
} from "@repo/core";
import type { Db } from "../database/database.ts";
import type { RunBinding } from "../run-binding/run-binding.ts";

export interface ReplyDeps {
	db: Db;
	agent: Agent;
	decisionAgent: DecisionAgent;
	/** The static GOAP catalog (`buildActions`). */
	actions: GoapAction[];
	/** Shared with the history store / usage recorder so their writes get linked to the running plan. */
	runs: RunBinding;
	/** Persists a thread's `WorldState` between `runPlan` calls so a stopped run can resume. */
	worldStateStore: WorldStateStore;
	/** Serializes `runPlan` calls that share a `threadId`. */
	runLock: RunLock;
	/** Classified WebMCP actions per thread, registered when the widget's panel opens. */
	webmcpCatalog: Map<string, GoapAction[]>;
	/**
	 * Extra actions for one thread, resolved per request (e.g. an MCP tool
	 * catalog bound to a live browser session — it can't live in the shared
	 * static catalog).
	 */
	threadActionsFor?: (threadId: string) => Promise<GoapAction[]> | GoapAction[];
	usageRecorder?: { flush(): void };
	now: () => number;
	onError?: (error: unknown) => void;
}
