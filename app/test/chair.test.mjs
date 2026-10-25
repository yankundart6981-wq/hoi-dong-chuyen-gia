import { test } from "node:test";
import assert from "node:assert/strict";
delete process.env.CHAIR_SEAT;
const { chairSeat, tableBoard } = await import("../lib/council.mjs");
test("Musk là Chủ toạ, không ngồi bàn", () => {
  assert.equal(chairSeat(), "musk");
  assert.deepEqual(tableBoard(true, ["bezos", "musk", "buffett"], [], "musk"), ["bezos", "buffett"]);
  assert.deepEqual(tableBoard(false, [], ["musk", "graham"], "musk"), ["graham"]);
});
