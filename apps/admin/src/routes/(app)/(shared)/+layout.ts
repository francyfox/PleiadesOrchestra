// Dashboard, channels, visitors, flow, blocked IPs, FAQ: staff and customers (the server scopes the data).
import { guard, signedIn } from "#lib/guards.js";

export const load = guard(signedIn);
