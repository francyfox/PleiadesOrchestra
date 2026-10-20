import { init } from "@paralleldrive/cuid2";
import ADJECTIVES from "./visitor-names.adjectives.json";
import ANIMALS from "./visitor-names.animals.json";

const suffix = init({ length: 6 });

const pick = (words: string[]) =>
	words[Math.floor(Math.random() * words.length)] as string;

/**
 * `adjective_animal_xxxxxx`. Not unique: ~100*100*36^6 combinations make
 * collisions rare, but `visitors.name` has no unique index and nothing relies on it.
 */
export function generateVisitorName(): string {
	return `${pick(ADJECTIVES)}_${pick(ANIMALS)}_${suffix()}`;
}
