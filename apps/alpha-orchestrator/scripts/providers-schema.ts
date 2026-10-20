import { join } from "node:path";
import { providersSchemaText } from "../src/modules/providers/providers.service.ts";

await Bun.write(
	join(import.meta.dir, "../configs/providers.schema.json"),
	providersSchemaText(),
);
console.log("wrote configs/providers.schema.json");
