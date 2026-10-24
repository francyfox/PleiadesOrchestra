import { defineComponent } from "../component.ts";
import { createNoticeModel, type NoticeOptions } from "./notice.model.ts";
import { noticeTemplate } from "./notice.template.tsx";

export const createNotice = (options: NoticeOptions) =>
	defineComponent("notice", createNoticeModel(options), noticeTemplate);
