import { defineComponent } from "../component.ts";
import {
	createModeSwitchModel,
	type ModeSwitchOptions,
} from "./mode-switch.model.ts";
import { modeSwitchTemplate } from "./mode-switch.template.ts";

export const createModeSwitch = (options: ModeSwitchOptions) =>
	defineComponent("mode", createModeSwitchModel(options), modeSwitchTemplate);
