import { test } from "node:test";
import assert from "node:assert/strict";
const { gocCuaPhien, promptHopTiep, MAX_PROMPT_TIEP } = await import("../lib/hop-tiep.mjs");

const verdict = { label: "GO WITH CONDITIONS", call: "Tăng 10% cho khách mới.", conditions: ["Khách giảm dưới 5%", "Đo 30 ngày"] };
const cv = { nhan_dinh: "Đồng ý nếu xoá bước duyệt giá." };
const phien = (prompt, extra = {}) => ({
  id: "x", prompt, mode: "quick", ...extra,
  events: [{ type: "setup", options: [] }, { type: "verdict", verdict }, { type: "chair_view", view: cv }, { type: "phieu", path: "docs/chien-luoc/a.md" }],
});

test("gocCuaPhien: phiên cũ không có trường mới thì lấy prompt và sự kiện phieu", () => {
  const g = gocCuaPhien(phien("ĐỀ BÀI GỐC"));
  assert.deepEqual([g.lan, g.goc_prompt, g.phieu, g.mode], [1, "ĐỀ BÀI GỐC", "docs/chien-luoc/a.md", "quick"]);
  assert.equal(g.verdict.call, verdict.call);
  assert.equal(g.chairView.nhan_dinh, cv.nhan_dinh);
});

test("gocCuaPhien: phiên họp tiếp giữ goc_prompt, lan, phieu của chuỗi; phiên không phiếu, không kết luận thì null", () => {
  const g = gocCuaPhien(phien("HỌP TIẾP LẦN 2 …", { lan: 2, goc_prompt: "ĐỀ BÀI GỐC", phieu: "docs/chien-luoc/a.md", mode: "full" }));
  assert.deepEqual([g.lan, g.goc_prompt, g.phieu, g.mode], [2, "ĐỀ BÀI GỐC", "docs/chien-luoc/a.md", "full"]);
  const r = gocCuaPhien({ id: "y", prompt: "p", mode: "full", events: [{ type: "phieu", error: "EPERM" }] });
  assert.deepEqual([r.phieu, r.verdict, r.chairView], [null, null, null]);
});

test("promptHopTiep ≤ 6000 ký tự, luôn giữ bổ sung và kết luận trước", () => {
  const boSung = "B".repeat(2000);
  const p = promptHopTiep({ lan: 2, boSung, verdict, chairView: cv, gocPrompt: "G".repeat(9000) });
  assert.ok(p.length <= MAX_PROMPT_TIEP, String(p.length));
  assert.equal(MAX_PROMPT_TIEP, 6000);
  assert.ok(p.startsWith("HỌP TIẾP LẦN 2. Người hỏi bổ sung sau kết luận lần trước:\n"));
  assert.ok(p.includes(boSung));
  assert.match(p, /KẾT LUẬN LẦN TRƯỚC: LÀM, CÓ ĐIỀU KIỆN · Tăng 10% cho khách mới\. · Điều kiện: Khách giảm dưới 5%; Đo 30 ngày · Góc nhìn Chủ toạ: Đồng ý nếu xoá bước duyệt giá\./);
  assert.match(p, /ĐỀ BÀI GỐC:\nG+/);
  const ngan = promptHopTiep({ lan: 3, boSung: "Giá vốn 200k", verdict, chairView: null, gocPrompt: "ngắn" });
  assert.ok(!ngan.includes("Góc nhìn Chủ toạ"));
  assert.match(ngan, /^HỌP TIẾP LẦN 3\./);
  assert.match(ngan, /ĐỀ BÀI GỐC:\nngắn\n/);
});

test("họp lần 3: giữ các lần bổ sung trước (mới nhất trước), vẫn ≤ 6000 ký tự", async () => {
  const { gocCuaPhien, promptHopTiep, MAX_PROMPT_TIEP } = await import("../lib/hop-tiep.mjs");
  const g = gocCuaPhien({ ...phien("HỌP TIẾP LẦN 2 …", { lan: 2, goc_prompt: "ĐỀ BÀI GỐC", phieu: "a.md" }), bo_sung: "Ca tối đã kín 90%", bo_sung_truoc: ["Lần 1 chưa có gì"] });
  assert.deepEqual(g.bo_sung_truoc, ["Lần 1 chưa có gì", "Ca tối đã kín 90%"]);
  const p = promptHopTiep({ lan: 3, boSung: "B".repeat(2000), boSungTruoc: g.bo_sung_truoc, verdict, chairView: cv, gocPrompt: "G".repeat(9000) });
  assert.ok(p.length <= MAX_PROMPT_TIEP, String(p.length));
  assert.match(p, /BỔ SUNG CÁC LẦN TRƯỚC \(mới nhất trước\):\n- Ca tối đã kín 90%\n- Lần 1 chưa có gì\n/);
  assert.ok(p.indexOf("BỔ SUNG CÁC LẦN TRƯỚC") < p.indexOf("ĐỀ BÀI GỐC:"));
  const dai = promptHopTiep({ lan: 3, boSung: "x", boSungTruoc: ["A".repeat(1500), "B".repeat(1500)], verdict, chairView: cv, gocPrompt: "g" });
  const khoi = dai.split("BỔ SUNG CÁC LẦN TRƯỚC (mới nhất trước):\n")[1].split("\nĐỀ BÀI GỐC:")[0];
  assert.ok(khoi.length <= 1000, String(khoi.length));
  assert.ok(!promptHopTiep({ lan: 2, boSung: "x", verdict, chairView: cv, gocPrompt: "g" }).includes("BỔ SUNG CÁC LẦN TRƯỚC"));
});

test("lanKeTiep: lấy số lần lớn nhất trong phiếu + 1, không nhỏ hơn lần của phiên + 1", async () => {
  const { lanKeTiep } = await import("../lib/hop-tiep.mjs");
  assert.equal(lanKeTiep("# Phiếu\n\n## Lần họp 2 (2026-10-26)\n…\n## Lần họp 3 (2026-10-27)\n", 1), 4);
  assert.equal(lanKeTiep("# Phiếu chưa họp tiếp\n", 1), 2);
  assert.equal(lanKeTiep("", 3), 4);
});
