import { expect, test } from "bun:test";
import { parseUsersQuery, usersSearch } from "./users-query";

test("the URL round-trips search, sort and page; unknown values are dropped", () => {
	const query = parseUsersQuery(
		new URLSearchParams("q=+ann+&sort=balanceUsd&order=desc&page=3"),
	);
	expect(query).toEqual({
		page: 3,
		pageSize: 10,
		q: "ann",
		sort: "balanceUsd",
		order: "desc",
	});
	expect(usersSearch(query, { page: 4 })).toBe(
		"?q=ann&sort=balanceUsd&order=desc&page=4",
	);
	// A new sort starts from page 1.
	expect(usersSearch(query, { sort: "email", order: "asc" })).toBe(
		"?q=ann&sort=email",
	);
	expect(
		parseUsersQuery(new URLSearchParams("sort=password&order=desc")),
	).toEqual({ page: 1, pageSize: 10 });
});
