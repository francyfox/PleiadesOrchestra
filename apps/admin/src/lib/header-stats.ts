import { PersistedState } from "runed";

/** The host CPU/RAM/GPU meter in the header: off by default, kept per browser (staff only, see `/preferences`). */
export const headerStats = new PersistedState("header-stats", false);
