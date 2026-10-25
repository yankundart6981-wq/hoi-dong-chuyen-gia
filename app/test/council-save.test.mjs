import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
process.env.SESSIONS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-"));
const { save, listSaved, loadSaved, finishRun } = await import("../lib/council.mjs");

const phien = (id, extra = {}) => ({ id, prompt: "Đề bài", mode: "quick", status: "done", events: [{ type: "verdict", verdict: { label: "GO" } }], state: { title: "Tăng giá khám" }, ...extra });

test("save: hai phiên cùng ngày cùng tiêu đề (họp tiếp) không ghi đè nhau; trường liên kết được lưu", () => {
  save(phien("2026-10-25-aaa1"));
  save(phien("2026-10-25-bbb2", { parent: "2026-10-25-aaa1", lan: 2, goc_prompt: "Đề bài", phieu: "docs/chien-luoc/a.md", bo_sung: "Thêm số", bo_sung_truoc: [] }));
  const ids = listSaved().map((x) => x.id).sort();
  assert.deepEqual(ids, ["2026-10-25-aaa1", "2026-10-25-bbb2"]);
  const b = loadSaved("2026-10-25-bbb2");
  assert.deepEqual([b.parent, b.lan, b.goc_prompt, b.phieu, b.bo_sung], ["2026-10-25-aaa1", 2, "Đề bài", "docs/chien-luoc/a.md", "Thêm số"]);
  assert.equal(loadSaved("2026-10-25-aaa1").lan, undefined);
});

test("finishRun lưu s.phieu; cập nhật phiếu lỗi thì sự kiện vẫn mang cap_nhat", () => {
  const seen = [];
  const s = { id: "2026-10-25-ccc3", events: [], started: Date.now(), subs: new Set([{ write: (l) => seen.push(JSON.parse(l.slice(6))) }]), onDone: () => ({ path: "docs/chien-luoc/x.md", cap_nhat: true, so_doi: false }) };
  finishRun(s, () => {});
  assert.equal(s.phieu, "docs/chien-luoc/x.md");
  assert.deepEqual(seen[0], { type: "phieu", t: seen[0].t, path: "docs/chien-luoc/x.md", cap_nhat: true, so_doi: false });
  const seen2 = [];
  const s2 = { id: "2026-10-25-ddd4", events: [], started: Date.now(), subs: new Set([{ write: (l) => seen2.push(JSON.parse(l.slice(6))) }]), onDone: (x) => { x.cap_nhat = true; throw new Error("EPERM"); } };
  const err = console.error; console.error = () => {};
  try { finishRun(s2, () => {}); } finally { console.error = err; }
  assert.equal(seen2[0].cap_nhat, true);
  assert.match(seen2[0].error, /EPERM/);
});
