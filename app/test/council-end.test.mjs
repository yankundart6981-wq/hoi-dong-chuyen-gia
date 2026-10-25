import { test } from "node:test";
import assert from "node:assert/strict";
const { finishRun } = await import("../lib/council.mjs");

const phien = (onDone) => {
  const seen = [];
  const s = { id: "2026-10-25-t", events: [], started: Date.now(), status: "running", onDone, subs: new Set([{ write: (l) => seen.push(JSON.parse(l.slice(6))) }]) };
  return { s, seen };
};

test("finishRun: phiếu ghi xong thì phát { type: phieu, path } trước end, và nằm trong events đã lưu", () => {
  const { s, seen } = phien(() => ({ path: "docs/chien-luoc/2026-10-25-hoi-dong-x.md" }));
  let luu;
  finishRun(s, (x) => { luu = x.events.map((e) => e.type); });
  assert.deepEqual(seen.map((e) => e.type), ["phieu", "usage", "end"]);
  assert.equal(seen[0].path, "docs/chien-luoc/2026-10-25-hoi-dong-x.md");
  assert.equal(s.status, "done");
  assert.deepEqual(luu, ["phieu", "usage"]);
});

test("finishRun: ghi phiếu lỗi thì phát { type: phieu, error } trước end, hội đồng vẫn xong", () => {
  const { s, seen } = phien(() => { throw new Error("EPERM: operation not permitted, open 'docs/chien-luoc/x.md'"); });
  const err = console.error; console.error = () => {};
  try { finishRun(s, () => {}); } finally { console.error = err; }
  assert.deepEqual(seen.map((e) => e.type), ["phieu", "usage", "end"]);
  assert.match(seen[0].error, /EPERM/);
  assert.ok(!("path" in seen[0]));
  assert.equal(s.status, "done");
});

test("finishRun: không có onDone (hội đồng từ /roast-room) thì không có sự kiện phieu", () => {
  const { s, seen } = phien(undefined);
  finishRun(s, () => {});
  assert.deepEqual(seen.map((e) => e.type), ["usage", "end"]);
});
