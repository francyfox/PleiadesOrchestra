import Alpine from "@alpinejs/csp";

let instances = 0;

/** One piece of the widget: its markup (a string carrying its own `x-data` scope) and its reactive model. */
export interface Component<M> {
	scope: string;
	html: string;
	model: M;
}

/**
 * Registers `model` with Alpine under a fresh scope name and renders its
 * template with that name. The model stays a plain object everywhere else (so
 * it is unit-tested without a DOM); this is the only place it becomes reactive.
 * Components never share a model — they are told what to show by `render`.
 */
export function defineComponent<M extends object>(
	name: string,
	model: M,
	template: (scope: string) => string,
): Component<M> {
	const scope = `pl_${name}_${++instances}`;
	const reactive = Alpine.reactive(model);
	Alpine.data(scope, () => reactive);
	return { scope, html: template(scope), model: reactive };
}
