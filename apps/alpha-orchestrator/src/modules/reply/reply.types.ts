import type {
	Agent,
	DecisionAgent,
	FunctionCallAgent,
	GoapAction,
	HistoryStore,
	RunLock,
	Taxonomy,
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
	/**
	 * The intent sets a channel runs with. Empty: the message picks one of the site's
	 * own tools (`chooseTool`). Unset (tests, old callers): the built-in intent flow.
	 */
	intentSets?: (channelId: string) => string[];
	/** Split a message of several tasks with delta even on a channel without intent sets. */
	severalTasks?: (channelId: string) => boolean;
	/**
	 * What a channel's presets merge into: the intents Laya picks from, what a tool
	 * of each needs and gives, the word rules and the guards. The shop's when unset.
	 */
	taxonomy?: (channelId: string) => Taxonomy;
	/** What each site's classifier has been taught; asked before Laya. */
	intentMemory?: IntentMemory;
	/**
	 * Laya's intent answers with (calibrated) confidence from here up are
	 * stored as approved (`approvedBy: "auto"`) and taught to the site's memory;
	 * below, or unset, they wait for a person.
	 */
	layaAutoApproveConfidence?: number;
	/** `delta-function-call`: fills in WebMCP tool arguments as JSON; unset = built from facts. */
	functionCallAgent?: FunctionCallAgent;
	/** `alpha-understand`: message -> English + tasks with products and counts in one call; unset or failing = the message goes on as typed. */
	understandAgent?: FunctionCallAgent;
	/** The channel persona's fixed answer language (ISO code); "" or unset = the visitor's. */
	personaLang?: (channelId: string) => string | undefined;
	/** Where the visitor's message is stored when the run starts (so a reload mid-run still shows it). */
	history?: HistoryStore;
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
