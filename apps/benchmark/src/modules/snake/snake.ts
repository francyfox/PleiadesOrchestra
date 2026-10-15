/**
 * Deterministic Snake rules and the cycle safety planner, ported from
 * mizorewww/laya-mlx `laya_mlx/snake/game.py` (Apache-2.0). The planner
 * describes each direction to Laya (legal? safe along the Hamiltonian
 * cycle? progress toward food?) — Laya only picks among those descriptions.
 */

export const DIRECTIONS = ["UP", "DOWN", "LEFT", "RIGHT"] as const;
export type Direction = (typeof DIRECTIONS)[number];
export type Cell = [x: number, y: number];

const VECTORS: Record<Direction, Cell> = {
	UP: [0, -1],
	DOWN: [0, 1],
	LEFT: [-1, 0],
	RIGHT: [1, 0],
};

const key = ([x, y]: Cell) => `${x},${y}`;
const same = (a: Cell | null, b: Cell | null) =>
	a !== null && b !== null && a[0] === b[0] && a[1] === b[1];

/** Visits each cell once with adjacent steps, including the closing edge. */
export function hamiltonianCycle(width: number, height: number): Cell[] {
	if (Math.min(width, height) < 4 || (width % 2 === 1 && height % 2 === 1)) {
		throw new Error(
			"Board dimensions must be >= 4, with at least one even dimension",
		);
	}
	if (height % 2 === 1) {
		return hamiltonianCycle(height, width).map(([x, y]) => [y, x]);
	}
	const path: Cell[] = [[0, 0]];
	for (let y = 0; y < height; y++) {
		if (y % 2 === 0) for (let x = 1; x < width; x++) path.push([x, y]);
		else for (let x = width - 1; x > 0; x--) path.push([x, y]);
	}
	for (let y = height - 1; y > 0; y--) path.push([0, y]);
	return path;
}

/** mulberry32 — small seeded PRNG, so a seed reproduces a run's food. */
function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface MoveInfo {
	direction: Direction;
	legal: boolean;
	safe: boolean;
	/** Steps forward along the cycle this move makes. */
	advance: number;
	reason: string;
	eats: boolean;
}

export interface GameOptions {
	width?: number;
	height?: number;
	seed?: number;
	initialLength?: number;
}

export class SnakeGame {
	readonly width: number;
	readonly height: number;
	readonly seed: number;
	readonly capacity: number;
	/** Head first. */
	body: Cell[];
	food: Cell | null;
	score = 0;
	ticks = 0;
	alive = true;
	won = false;
	deathReason: string | null = null;

	private readonly cycle: Cell[];
	private readonly indices = new Map<string, number>();
	private readonly random: () => number;

	constructor({
		width = 24,
		height = 16,
		seed = 7,
		initialLength = 6,
	}: GameOptions = {}) {
		this.width = width;
		this.height = height;
		this.seed = seed;
		this.cycle = hamiltonianCycle(width, height);
		this.cycle.forEach((cell, index) => {
			this.indices.set(key(cell), index);
		});
		this.capacity = width * height;
		if (initialLength < 2 || initialLength >= this.capacity) {
			throw new Error("Initial length must be >= 2 and smaller than the board");
		}
		this.random = seededRandom(seed);
		const start = this.indexOf([Math.floor(width / 2), Math.floor(height / 2)]);
		this.body = Array.from(
			{ length: initialLength },
			(_, i) => this.cycle[(start - i + this.capacity) % this.capacity] as Cell,
		);
		this.food = this.spawnFood();
	}

	get head(): Cell {
		return this.body[0] as Cell;
	}

	private indexOf(cell: Cell): number {
		const index = this.indices.get(key(cell));
		if (index === undefined)
			throw new Error(`Cell off the board: ${key(cell)}`);
		return index;
	}

	private spawnFood(): Cell | null {
		const occupied = new Set(this.body.map(key));
		const empty = this.cycle.filter((cell) => !occupied.has(key(cell)));
		if (empty.length === 0) return null;
		return empty[Math.floor(this.random() * empty.length)] as Cell;
	}

	private target(direction: Direction): Cell {
		const [dx, dy] = VECTORS[direction];
		return [this.head[0] + dx, this.head[1] + dy];
	}

	private legalReason(direction: Direction): string {
		const cell = this.target(direction);
		const [x, y] = cell;
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) return "wall";
		if (same(cell, this.body[1] ?? null)) return "reverse";
		const occupied = new Set(this.body.map(key));
		// The tail moves away on a non-growing step.
		if (!same(cell, this.food)) occupied.delete(key(this.body.at(-1) as Cell));
		return occupied.has(key(cell)) ? "body" : "legal";
	}

	moves(): MoveInfo[] {
		if (!this.alive || this.won || this.food === null) return [];
		const headIndex = this.indexOf(this.head);
		const distance = (cell: Cell) =>
			(this.indexOf(cell) - headIndex + this.capacity) % this.capacity;
		const tailDistance = distance(this.body.at(-1) as Cell);
		const foodDistance = distance(this.food);

		return DIRECTIONS.map((direction) => {
			let reason = this.legalReason(direction);
			const legal = reason === "legal";
			const target = this.target(direction);
			const targetIndex = this.indices.get(key(target)) ?? headIndex;
			const advance = (targetIndex - headIndex + this.capacity) % this.capacity;
			const eats = same(target, this.food);
			let safe = legal;
			if (
				safe &&
				(advance > tailDistance || (advance === tailDistance && eats))
			) {
				safe = false;
				reason = "would cross the tail";
			}
			if (safe && (advance === 0 || advance > foodDistance)) {
				safe = false;
				reason = "would skip the food on the safe route";
			}
			return { direction, legal, safe, advance, reason, eats };
		});
	}

	/** Current empty-cell connectivity from the head; the tail counts as occupied. */
	foodReachability(): { reachable: boolean; space: number } {
		const blocked = new Set(this.body.slice(1).map(key));
		const visited = new Set([key(this.head)]);
		const queue: Cell[] = [this.head];
		while (queue.length > 0) {
			const [x, y] = queue.shift() as Cell;
			for (const [dx, dy] of Object.values(VECTORS)) {
				const cell: Cell = [x + dx, y + dy];
				const k = key(cell);
				if (
					cell[0] >= 0 &&
					cell[0] < this.width &&
					cell[1] >= 0 &&
					cell[1] < this.height &&
					!blocked.has(k) &&
					!visited.has(k)
				) {
					visited.add(k);
					queue.push(cell);
				}
			}
		}
		return {
			reachable: this.food !== null && visited.has(key(this.food)),
			space: visited.size,
		};
	}

	/** Returns whether the move ate food. */
	step(direction: Direction): boolean {
		if (!this.alive || this.won) throw new Error("Cannot step a finished game");
		this.ticks++;
		const reason = this.legalReason(direction);
		if (reason !== "legal") {
			this.alive = false;
			this.deathReason = reason;
			return false;
		}
		const target = this.target(direction);
		this.body.unshift(target);
		if (same(target, this.food)) {
			this.score++;
			if (this.body.length === this.capacity) {
				this.won = true;
				this.food = null;
			} else {
				this.food = this.spawnFood();
			}
			return true;
		}
		this.body.pop();
		return false;
	}

	/** Body occupies the cycle in order (tail → head), without wrapping past itself. */
	cycleOrderValid(): boolean {
		const indices = [...this.body].reverse().map((cell) => this.indexOf(cell));
		let total = 0;
		for (let i = 1; i < indices.length; i++) {
			const d =
				((indices[i] as number) - (indices[i - 1] as number) + this.capacity) %
				this.capacity;
			if (d <= 0) return false;
			total += d;
		}
		return total < this.capacity;
	}
}
