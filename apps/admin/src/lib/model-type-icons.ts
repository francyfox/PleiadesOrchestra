import ArrowUpDownIcon from "@lucide/svelte/icons/arrow-up-down";
import AudioLinesIcon from "@lucide/svelte/icons/audio-lines";
import BoxesIcon from "@lucide/svelte/icons/boxes";
import GavelIcon from "@lucide/svelte/icons/gavel";
import ImageIcon from "@lucide/svelte/icons/image";
import MicIcon from "@lucide/svelte/icons/mic";
import TypeIcon from "@lucide/svelte/icons/type";
import VideoIcon from "@lucide/svelte/icons/video";
import type { ModelType } from "./model-types.ts";

/** The icons of OpenRouter's model tabs, where this app has the same kind. */
export const MODEL_TYPE_ICONS = {
	language: TypeIcon,
	embedding: BoxesIcon,
	image: ImageIcon,
	video: VideoIcon,
	speech: AudioLinesIcon,
	transcription: MicIcon,
	reranking: ArrowUpDownIcon,
	decision: GavelIcon,
} as const satisfies Record<ModelType, unknown>;
