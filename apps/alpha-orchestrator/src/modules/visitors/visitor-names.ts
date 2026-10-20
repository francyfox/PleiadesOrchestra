import { init } from "@paralleldrive/cuid2";

const ADJECTIVES =
	`able amber ancient autumn bold brave bright brisk calm candid careful cheerful clever cosmic crisp curious daring dawn deep eager early elegant faint fancy fast fearless fluent forest frosty gentle giant glad golden graceful grand happy hardy hidden honest humble icy jolly keen kind lively lucky lunar mellow merry mighty misty modest nimble noble north odd patient peaceful plain polar proud quick quiet rapid rare ready regal restless rosy royal rustic sandy shy silent silver simple sleepy smooth snowy solar solid steady still stormy sunny swift tidy tiny tranquil true vivid warm wild windy wise witty young zesty`.split(
		" ",
	);

const ANIMALS =
	`albatross alpaca antelope badger bat bear beaver bison bobcat buffalo camel capybara caribou cat cheetah cobra condor cougar coyote crane crow deer dingo dolphin dove dragonfly eagle egret elk falcon ferret finch fox frog gazelle gecko giraffe goat goose gull hamster hare hawk hedgehog heron horse hummingbird ibex ibis iguana jackal jaguar kangaroo kingfisher koala lemur leopard lion lizard llama lynx magpie manatee marmot meerkat mole moose moth narwhal newt ocelot octopus orca osprey otter owl panda panther parrot pelican penguin pigeon puffin quail rabbit raccoon raven robin salmon seal sheep sparrow squirrel swan tiger toucan turtle walrus whale wolf wombat yak zebra`.split(
		" ",
	);

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
