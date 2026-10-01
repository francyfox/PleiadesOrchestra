import { hasBearer } from "@repo/elysia-kit";

/** Health and API docs are open; everything else needs the shared bearer key. */
export function authorizeRequest(
	request: Request,
	apiKey: string,
): { status: number; body: string } | undefined {
	const pathname = new URL(request.url).pathname;
	if (pathname === "/health" || pathname.startsWith("/swagger")) return;
	if (!hasBearer(request, apiKey)) return { status: 401, body: "Unauthorized" };
}
