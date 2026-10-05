import { defineComponent } from "../component.ts";
import { type ComposerOptions, createComposerModel } from "./composer.model.ts";
import { composerTemplate } from "./composer.template.ts";

export const createComposer = (options: ComposerOptions) =>
	defineComponent("composer", createComposerModel(options), composerTemplate);
