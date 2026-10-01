import type { channels } from "../database/database.schema.ts";

export type ChannelRow = typeof channels.$inferSelect;
export type AccessMode = ChannelRow["accessMode"];
