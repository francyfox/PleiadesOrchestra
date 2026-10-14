import { join } from "node:path";
import { buildInitSql } from "../src/modules/database/database.snapshot.ts";

const dir = join(import.meta.dir, "../drizzle");
await Bun.write(join(dir, "init.sql"), buildInitSql(dir));
console.log("wrote drizzle/init.sql");
