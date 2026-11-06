import adminCreate from "./commands/admin-create.ts";
import evalCommand from "./commands/eval.ts";
import { helpCommand } from "./commands/help.ts";
import reset from "./commands/reset.ts";
import send from "./commands/send.ts";

/** Every command, with its shortcut (`alias`): `albedo s -m "hi"` is `albedo send -m "hi"`. */
export const commands = [send, reset, adminCreate, evalCommand, helpCommand];
