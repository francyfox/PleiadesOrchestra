import { describe, expect, test } from "bun:test";
import {
	nextPage,
	parseUsersState,
	prevPage,
	sortingFromState,
	toUsersQuery,
	usersStateToSearch,
	withFilters,
	withSorting,
} from "./users-table-state";

const parse = (search: string) => parseUsersState(new URLSearchParams(search));

describe("parseUsersState", () => {
	test("defaults: newest activity first, 10 rows, first page", () => {
		expect(parse("")).toEqual({
			sort: "lastSeenAt",
			order: "desc",
			limit: 10,
			trail: [],
		});
	});

	test("reads filters, sort and paging from the URL", () => {
		expect(
			parse(
				"channel=telegram&kind=anonymous&status=pending&q=ivan&sort=tokens&order=asc&limit=20&cursor=c2&trail=c0,c1",
			),
		).toEqual({
			channel: "telegram",
			kind: "anonymous",
			status: "pending",
			q: "ivan",
			sort: "tokens",
			order: "asc",
			limit: 20,
			cursor: "c2",
			trail: ["c0", "c1"],
		});
	});

	test("ignores unknown enum values and clamps limit", () => {
		expect(parse("kind=robot&status=x&sort=name&order=up&limit=9999")).toEqual({
			sort: "lastSeenAt",
			order: "desc",
			limit: 200,
			trail: [],
		});
		expect(parse("limit=0").limit).toBe(1);
		expect(parse("limit=abc").limit).toBe(10);
	});
});

describe("usersStateToSearch", () => {
	test("omits defaults so the URL stays short", () => {
		expect(usersStateToSearch(parse("")).toString()).toBe("");
	});

	test("the default page size is not written, a different one is", () => {
		expect(usersStateToSearch(parse("limit=10")).toString()).toBe("");
		expect(usersStateToSearch(parse("limit=25")).toString()).toBe("limit=25");
	});

	test("round-trips a non-default state", () => {
		const search =
			"channel=shop&status=blocked&q=a+b&sort=createdAt&order=asc&limit=25&cursor=c1&trail=%2Cc0";
		const state = parse(search);
		expect(parse(usersStateToSearch(state).toString())).toEqual(state);
	});
});

describe("paging", () => {
	test("nextPage pushes the current cursor onto the trail", () => {
		const first = parse("");
		const second = nextPage(first, "c1");
		expect(second.cursor).toBe("c1");
		expect(second.trail).toEqual([""]);
		const third = nextPage(second, "c2");
		expect(third.trail).toEqual(["", "c1"]);
	});

	test("prevPage pops the trail back to the previous cursor", () => {
		const third = nextPage(nextPage(parse(""), "c1"), "c2");
		const second = prevPage(third);
		expect(second.cursor).toBe("c1");
		expect(second.trail).toEqual([""]);
		const first = prevPage(second);
		expect(first.cursor).toBeUndefined();
		expect(first.trail).toEqual([]);
	});

	test("changing filters restarts from the first page", () => {
		const paged = nextPage(parse("status=pending"), "c1");
		const filtered = withFilters(paged, { q: "x" });
		expect(filtered).toMatchObject({ status: "pending", q: "x", trail: [] });
		expect(filtered.cursor).toBeUndefined();
	});

	test("clearing a filter with an empty value drops it", () => {
		expect(withFilters(parse("channel=cli"), { channel: "" }).channel).toBe(
			undefined,
		);
	});
});

describe("sorting", () => {
	test("maps to a single TanStack sorting entry", () => {
		expect(sortingFromState(parse("sort=tokens&order=asc"))).toEqual([
			{ id: "tokens", desc: false },
		]);
	});

	test("applying TanStack sorting updates sort/order and resets paging", () => {
		const paged = nextPage(parse(""), "c1");
		const sorted = withSorting(paged, [{ id: "createdAt", desc: false }]);
		expect(sorted).toMatchObject({
			sort: "createdAt",
			order: "asc",
			trail: [],
		});
		expect(sorted.cursor).toBeUndefined();
	});

	test("clearing or unsupported sorting falls back to the default", () => {
		expect(withSorting(parse("sort=tokens"), [])).toMatchObject({
			sort: "lastSeenAt",
			order: "desc",
		});
		expect(
			withSorting(parse(""), [{ id: "displayName", desc: true }]).sort,
		).toBe("lastSeenAt");
	});
});

describe("toUsersQuery", () => {
	test("forwards everything the orchestrator understands, not the trail", () => {
		expect(toUsersQuery(nextPage(parse("status=pending&q=z"), "c1"))).toEqual({
			status: "pending",
			q: "z",
			sort: "lastSeenAt",
			order: "desc",
			limit: 10,
			cursor: "c1",
		});
	});
});
