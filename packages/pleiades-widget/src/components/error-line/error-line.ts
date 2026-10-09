import type { Strings } from "@/lib/i18n/i18n.ts";
import { defineComponent } from "../component.ts";
import { createErrorLineModel } from "./error-line.model.ts";
import { errorLineTemplate } from "./error-line.template.tsx";

export const createErrorLine = (s: Strings) =>
	defineComponent("error", createErrorLineModel(s), errorLineTemplate);
