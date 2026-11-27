/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { isNewUser, newUsersSince, OVERVIEW_CARDS, overviewCardMemory, overviewCounts, overviewEmptyText, overviewList, searchPlaceholder } from "./overviewStats";

// 2026-11-28 10:00 in Vietnam (03:00 UTC).
const NOW = Date.parse("2026-11-28T03:00:00Z");
const user = (name: string, email: string, createdAt: string) => ({ id: email, name, email, createdAt });
const users = [
  user("Nguyễn Văn An", "an@example.com", "2026-11-27T10:00:00Z"),
  user("Trần Bình", "binh@example.com", "2026-11-21T17:00:00Z"), // 22/11 00:00 VN: first day of the 7
  user("Lê Cường", "cuong@example.com", "2026-11-21T16:59:59Z"), // 21/11 23:59:59 VN: outside
  user("Phạm Dung", "dung@example.com", "2026-11-28T02:00:00Z"),
];
const families = [{ id: "f1", name: "Nhà Hạnh Phúc", memberCount: 3, createdAt: "2026-10-01T00:00:00Z" }, { id: "f2", name: "Gia đình An", memberCount: 2, createdAt: "2026-11-20T00:00:00Z" }];

test("overview: three selectable cells — users, families, new in 7 days (no system status, services or reports)", () => {
  assert.deepEqual(OVERVIEW_CARDS.map((card) => card.label), ["Người dùng", "Gia đình", "Mới (7 ngày)"]);
  for (const gone of ["Trạng thái hệ thống", "Dịch vụ có vấn đề", "Báo cáo chờ xử lý"]) assert.equal(OVERVIEW_CARDS.some((card) => card.label === gone), false);
});

test("selector: default Người dùng, choice remembered, unknown → Người dùng", () => {
  assert.equal(overviewCardMemory.get(), "users");
  assert.equal(overviewCardMemory.set("newUsers"), "newUsers");
  assert.equal(overviewCardMemory.get(), "newUsers");
  assert.equal(overviewCardMemory.set("reports"), "users");
});

test("7-day filter: today and the 6 days before, in Vietnam days", () => {
  assert.equal(new Date(newUsersSince(NOW)).toISOString(), "2026-11-21T17:00:00.000Z");
  assert.equal(isNewUser("2026-11-21T17:00:00Z", NOW), true);
  assert.equal(isNewUser("2026-11-21T16:59:59Z", NOW), false);
  assert.equal(isNewUser("nope", NOW), false);
  // Just after midnight in Vietnam (still the previous day in UTC), the window moves with the Vietnam day.
  const earlyVn = Date.parse("2026-11-27T17:30:00Z"); // 28/11 00:30 VN
  assert.equal(new Date(newUsersSince(earlyVn)).toISOString(), "2026-11-21T17:00:00.000Z");
  assert.deepEqual(overviewCounts(users, families, NOW), { users: 4, families: 2, newUsers: 3 });
});

test("list per selection, newest first", () => {
  const all = overviewList("users", users, families, "", NOW);
  assert.equal(all.kind, "users");
  assert.deepEqual(all.items.map((item) => item.name), ["Phạm Dung", "Nguyễn Văn An", "Trần Bình", "Lê Cường"]);
  assert.deepEqual(overviewList("newUsers", users, families, "", NOW).items.map((item) => item.name), ["Phạm Dung", "Nguyễn Văn An", "Trần Bình"]);
  const fam = overviewList("families", users, families, "", NOW);
  assert.equal(fam.kind, "families");
  assert.deepEqual(fam.items.map((item) => item.name), ["Gia đình An", "Nhà Hạnh Phúc"]);
});

test("search: accent-insensitive; users by name or email, families by name; placeholders and empty texts", () => {
  assert.deepEqual(overviewList("users", users, families, "nguyen van", NOW).items.map((item) => item.name), ["Nguyễn Văn An"]);
  assert.deepEqual(overviewList("users", users, families, "BINH@", NOW).items.map((item) => item.name), ["Trần Bình"]);
  assert.deepEqual(overviewList("newUsers", users, families, "cuong", NOW).items, []);
  assert.deepEqual(overviewList("families", users, families, "hanh phuc", NOW).items.map((item) => item.id), ["f1"]);
  assert.equal(searchPlaceholder("users"), "Tìm tên hoặc email");
  assert.equal(searchPlaceholder("newUsers"), "Tìm tên hoặc email");
  assert.equal(searchPlaceholder("families"), "Tìm tên gia đình");
  assert.equal(overviewEmptyText("newUsers", false), "Không có người dùng mới trong 7 ngày");
  assert.equal(overviewEmptyText("users", true), "Không tìm thấy người dùng");
  assert.equal(overviewEmptyText("families", false), "Chưa có gia đình");
});
