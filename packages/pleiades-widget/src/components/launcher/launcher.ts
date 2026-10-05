import { defineComponent } from "../component.ts";
import { createLauncherModel, type LauncherOptions } from "./launcher.model.ts";
import { launcherTemplate } from "./launcher.template.ts";

export const createLauncher = (options: LauncherOptions) =>
	defineComponent("launcher", createLauncherModel(options), launcherTemplate);
