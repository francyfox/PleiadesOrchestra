import { Elysia, status } from "elysia";
import type { Rejection } from "./auth.service.ts";

/**
 * A guard for one group of routes: every route registered on the returned
 * instance (and the plugins it `.use`s) is checked, the rest of the app is not.
 * `onTransform`, not `onBeforeHandle`: body validation runs between them, so
 * a bad body would answer 422 before the key is checked. (`onRequest` is
 * global in Elysia whatever instance it is declared on, so it can't scope.)
 */
export function guarded(decide: (request: Request) => Rejection | undefined) {
	return new Elysia().onTransform(({ request }) => {
		const rejection = decide(request);
		if (rejection) throw status(rejection.status, rejection.body ?? "");
	});
}
