import { defineComponent } from "../component.ts";
import { createLauncherModel, type LauncherOptions } from "./launcher.model.ts";
import { launcherTemplate } from "./launcher.template.tsx";

export const createLauncher = (options: LauncherOptions) =>
	defineComponent("launcher", createLauncherModel(options), launcherTemplate);
