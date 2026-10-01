import { db } from "../database/database.instance.ts";
import { ChannelDirectory } from "./channel-directory.ts";

export const channelDirectory = new ChannelDirectory(db);
