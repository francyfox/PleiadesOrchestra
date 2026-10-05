import { defineComponent } from "../component.ts";
import { createPanelModel, type PanelOptions } from "./panel.model.ts";
import { panelTemplate } from "./panel.template.ts";

/** The frame around header, conversation, error line, mode switch, message box and footer. */
export const createPanel = (
	options: PanelOptions,
	children: readonly string[],
) =>
	defineComponent("panel", createPanelModel(options), panelTemplate(children));
