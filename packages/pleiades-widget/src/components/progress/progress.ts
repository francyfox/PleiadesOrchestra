import type { Strings } from "@/lib/i18n/i18n.ts";
import { defineComponent } from "../component.ts";
import { createProgressModel } from "./progress.model.ts";
import { progressTemplate } from "./progress.template.tsx";

export const createProgress = (s: Strings) =>
	defineComponent("progress", createProgressModel(s), progressTemplate);
