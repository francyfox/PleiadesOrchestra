import { RunBinding } from "./run-binding.ts";

/** Shared by the history store, the usage recorder and the reply stream. */
export const runs = new RunBinding();
