import { defineComponent } from "../component.ts";
import { createHeaderModel, type HeaderOptions } from "./header.model.ts";
import { headerTemplate } from "./header.template.tsx";

export const createHeader = (options: HeaderOptions) =>
	defineComponent("header", createHeaderModel(options), headerTemplate);
