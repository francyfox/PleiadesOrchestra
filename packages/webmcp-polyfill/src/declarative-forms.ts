import { dispatchToolEvent } from "./tool-events.ts";
import type { AnyWindow, ExecuteOptions, NormalizedTool } from "./types.ts";

const AUTOSUBMIT_TIMEOUT_MS = 5000;

type FieldElement = HTMLInputElement | HTMLSelectElement;
type AgentSubmitEvent = Event & {
	agentInvoked?: boolean;
	respondWith?: (v: unknown) => void;
};

interface FormRun {
	w: AnyWindow;
	toolName: string;
	form: HTMLFormElement;
	submitBtn: HTMLButtonElement | HTMLInputElement | null;
	signal?: AbortSignal;
}

export function findForm(w: AnyWindow, tool: NormalizedTool): HTMLFormElement {
	const form =
		tool._form ??
		w.document.querySelector<HTMLFormElement>(`form[toolname="${tool.name}"]`);
	if (!form) throw new Error(`Tool ${tool.name} not found`);
	return form;
}

function markActive(form: HTMLFormElement) {
	form.classList.add("tool-form-active");
	const submitBtn = form.querySelector<HTMLButtonElement | HTMLInputElement>(
		"button[type=submit], input[type=submit]",
	);
	submitBtn?.classList.add("tool-submit-active");
	return submitBtn;
}

function findField(form: HTMLFormElement, key: string): FieldElement | null {
	return (
		(form.elements.namedItem(key) as FieldElement | null) ??
		form.querySelector<HTMLInputElement>(`[name="${key}"]`)
	);
}

function setFieldValue(
	form: HTMLFormElement,
	input: FieldElement,
	key: string,
	value: unknown,
): void {
	if (input.tagName === "SELECT") {
		input.value = String(value);
	} else if (input.type === "checkbox") {
		(input as HTMLInputElement).checked = !!value;
	} else if (input.type === "radio") {
		const radio = form.querySelector<HTMLInputElement>(
			`input[name="${key}"][value="${value}"]`,
		);
		if (radio) radio.checked = true;
	} else {
		input.value = String(value);
	}
}

/** Writes `args` into the form's fields, firing input/change like a user would. */
export function fillForm(
	form: HTMLFormElement,
	args: Record<string, unknown>,
): void {
	for (const [key, value] of Object.entries(args)) {
		const input = findField(form, key);
		if (!input) continue;
		setFieldValue(form, input, key, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	}
}

/** One-shot outcome tracker: first terminal event wins, cleanup always runs. */
function createSettler(run: FormRun) {
	let done = false;
	const teardown: (() => void)[] = [];
	const cleanup = () => {
		run.form.classList.remove("tool-form-active");
		run.submitBtn?.classList.remove("tool-submit-active");
		for (const fn of teardown) fn();
	};
	const finish = (settle: () => void) => {
		done = true;
		cleanup();
		settle();
	};
	const cancel = (settle: () => void) =>
		finish(() => {
			dispatchToolEvent(run.w, "toolcancel", run.toolName);
			settle();
		});
	return {
		isDone: () => done,
		cleanup,
		finish,
		cancel,
		onCleanup: (fn: () => void) => void teardown.push(fn),
	};
}
type Settler = ReturnType<typeof createSettler>;

function abortError(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/** Returns false when the signal is already aborted (run is rejected and cleaned). */
function bindAbort(
	s: Settler,
	signal: AbortSignal,
	reject: (e: unknown) => void,
): boolean {
	if (signal.aborted) {
		s.cleanup();
		reject(abortError(signal));
		return false;
	}
	signal.addEventListener(
		"abort",
		() => {
			if (!s.isDone()) s.cancel(() => reject(abortError(signal)));
		},
		{ once: true },
	);
	return true;
}

function bindReset(run: FormRun, s: Settler, resolve: (v: unknown) => void) {
	const onReset = () => s.cancel(() => resolve(null));
	run.form.addEventListener("reset", onReset);
	s.onCleanup(() => run.form.removeEventListener("reset", onReset));
}

/** Lets the page answer the agent via `event.respondWith(value | promise)`. */
function respondWith(s: Settler, resolve: (v: unknown) => void) {
	return (val: unknown) => {
		if (val && typeof (val as Promise<unknown>).then === "function") {
			(val as Promise<unknown>)
				.then((v) => s.finish(() => resolve(v)))
				.catch((err: unknown) =>
					s.finish(() => resolve({ error: (err as Error).message ?? err })),
				);
		} else {
			s.finish(() => resolve(val));
		}
	};
}

function bindSubmit(run: FormRun, s: Settler, resolve: (v: unknown) => void) {
	const onSubmit = (e: Event) => {
		if (s.isDone()) return;
		const event = e as AgentSubmitEvent;
		event.agentInvoked = true;
		event.respondWith = respondWith(s, resolve);
	};
	run.form.addEventListener("submit", onSubmit, true);
	s.onCleanup(() => run.form.removeEventListener("submit", onSubmit, true));
}

const WATCHED_ATTRIBUTES = ["toolname", "tooldescription"];

/** Cancels when the form leaves the DOM or stops being a tool. */
function bindRemovalWatch(
	run: FormRun,
	s: Settler,
	resolve: (v: unknown) => void,
) {
	const observer = new MutationObserver((mutations) => {
		const removed = !run.w.document.body.contains(run.form);
		const attrChanged = mutations.some(
			(m) =>
				m.type === "attributes" &&
				m.target === run.form &&
				WATCHED_ATTRIBUTES.includes(m.attributeName ?? ""),
		);
		if (removed || attrChanged) s.cancel(() => resolve(null));
	});
	s.onCleanup(() => observer.disconnect());
	observer.observe(run.form, { attributes: true });
	if (run.form.parentNode)
		observer.observe(run.form.parentNode, { childList: true });
}

function startSubmission(
	run: FormRun,
	s: Settler,
	resolve: (v: unknown) => void,
) {
	if (!run.form.hasAttribute("toolautosubmit")) {
		run.submitBtn?.focus();
		return;
	}
	run.form.dispatchEvent(
		new Event("submit", { cancelable: true, bubbles: true }),
	);
	setTimeout(() => {
		if (s.isDone()) return;
		s.cleanup();
		resolve(null);
	}, AUTOSUBMIT_TIMEOUT_MS);
}

function awaitOutcome(run: FormRun): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const s = createSettler(run);
		if (run.signal && !bindAbort(s, run.signal, reject)) return;
		bindReset(run, s, resolve);
		bindSubmit(run, s, resolve);
		bindRemovalWatch(run, s, resolve);
		startSubmission(run, s, resolve);
	});
}

/** Runs a declarative form tool: fill, announce, then wait for submit/reset/abort. */
export function runFormTool(
	w: AnyWindow,
	tool: NormalizedTool,
	args: unknown,
	options: ExecuteOptions,
): Promise<unknown> {
	const form = findForm(w, tool);
	const submitBtn = markActive(form);
	fillForm(form, args as Record<string, unknown>);
	dispatchToolEvent(w, "toolactivated", tool.name);
	return awaitOutcome({
		w,
		toolName: tool.name,
		form,
		submitBtn,
		signal: options?.signal,
	});
}
