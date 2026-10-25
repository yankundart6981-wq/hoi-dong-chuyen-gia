import { test } from "node:test";
import assert from "node:assert/strict";
delete process.env.CHAIR_SEAT;
const { chairBrain, chairSeat } = await import("../lib/seats.mjs");
const council = await import("../lib/council.mjs");

test("chairSeat sống ở seats.mjs, council.mjs re-export", () => {
  assert.equal(council.chairSeat, chairSeat);
  assert.equal(chairSeat(), "musk");
});

test("chairBrain đọc _hot, principles, voice, frameworks của Chủ toạ, _hot đứng đầu", () => {
  const t = chairBrain("musk");
  const i = ["_hot.md", "principles.md", "voice.md", "frameworks.md"].map((f) => t.indexOf(`===== brains/elon-musk/${f} =====`));
  assert.ok(i.every((x) => x >= 0), JSON.stringify(i));
  assert.deepEqual([...i].sort((a, b) => a - b), i);
  assert.ok(!t.includes("positions.md"));
});

test("chairBrain quá giới hạn thì cắt frameworks trước, _hot giữ nguyên", () => {
  const full = chairBrain("musk");
  const hot = full.split("===== brains/elon-musk/principles.md =====")[0];
  const t = chairBrain("musk", { max: hot.length + 3000 });
  assert.ok(t.length <= hot.length + 3000, String(t.length));
  assert.ok(t.startsWith(hot.trimEnd()));
  assert.ok(!t.includes("frameworks.md"));
  const tiny = chairBrain("musk", { max: 10 });
  assert.ok(tiny.startsWith(hot.trimEnd()), "_hot luôn giữ dù vượt giới hạn");
  assert.ok(!tiny.includes("principles.md"));
});

test("chairBrain: ghế không có thì rỗng", () => {
  assert.equal(chairBrain("khong-co"), "");
});
