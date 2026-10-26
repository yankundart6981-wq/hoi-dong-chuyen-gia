import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const { createHoiGoc, MAX_LUOT, MAX_PROMPT } = await import("../lib/hoi-goc.mjs");
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "hoi-"));
const luot = (n, extra = {}) => ({ loai: "chien_luoc", tra_loi_ban_dau: "Tăng giá", nhan_xet_so: n > 1 ? "Số đang ủng hộ" : "", cau_hoi: [{ id: "q1", hoi: `Câu ${n}?`, lua_chon: ["A", "B"] }], de_xuat_van_de_goc: "", ...extra });
const facts = { su_that: [{ y: "Doanh thu", so: "1 tỷ", nguon: "wiki/a.md", ngay: "2026-09" }], chua_biet: [], tra_loi_tra_cuu: "" };
const deBai = { title: "Tăng giá khám", phuong_an: [{ id: "A", label: "Tăng 10%" }, { id: "B", label: "Giữ nguyên" }], chon: [0] };

function fakeAsk(replies) { const calls = []; return { calls, ask: async (o) => { calls.push(o); return replies.shift(); } }; }

test("câu tra cứu: trả lời ngay, không mở vòng hỏi", async () => {
  const { ask } = fakeAsk([{ ...luot(1), loai: "tra_cuu", cau_hoi: [] }]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => ({ ...facts, tra_loi_tra_cuu: "Doanh thu T9 là 1 tỷ (wiki/a.md)." }), saveDir: dir() });
  const r = await hg.start("Doanh thu T9 bao nhiêu?");
  assert.equal(r.loai, "tra_cuu");
  assert.match(r.tra_loi, /1 tỷ/);
  assert.equal(r.nguon[0].nguon, "wiki/a.md");
});

test("câu chiến lược: lượt 1 có câu hỏi, đọc tài liệu chạy nền", async () => {
  let docCalls = 0;
  const { ask } = fakeAsk([luot(1)]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => { docCalls++; return facts; }, saveDir: dir() });
  const r = await hg.start("Có nên tăng giá khám?");
  assert.equal(r.luot.so, 1);
  assert.equal(r.luot.cau_hoi[0].hoi, "Câu 1?");
  assert.equal(docCalls, 1);
});

test("đề xuất vấn đề gốc thì dừng hỏi; confirm ra đề bài ≤ 4000 ký tự có nguồn", async () => {
  const { ask, calls } = fakeAsk([luot(1), luot(2, { de_xuat_van_de_goc: "Giá đang thấp hơn chi phí sàn" }), deBai]);
  const saveDir = dir();
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir });
  const s = await hg.start("Có nên tăng giá khám?");
  const a = await hg.answer(s.id, [{ id: "q1", chon: "A" }]);
  assert.equal(a.de_xuat_van_de_goc, "Giá đang thấp hơn chi phí sàn");
  const c = await hg.confirm(s.id, null);
  assert.equal(c.de_bai.van_de_goc, "Giá đang thấp hơn chi phí sàn");
  assert.ok(c.de_bai.prompt.length <= MAX_PROMPT);
  assert.match(c.de_bai.prompt, /wiki\/a\.md/);
  assert.match(c.de_bai.prompt, /A\. Tăng 10%/);
  assert.equal(calls[1].effort, "medium");
  assert.ok(fs.readdirSync(saveDir).some((f) => f.endsWith(".json")));
});

test("người hỏi sửa vấn đề gốc thì dùng bản sửa", async () => {
  const { ask } = fakeAsk([luot(1), luot(2, { de_xuat_van_de_goc: "X" }), deBai]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Q?"); await hg.answer(s.id, [{ id: "q1", tu_go: "khác" }]);
  const c = await hg.confirm(s.id, "Bản anh sửa");
  assert.equal(c.de_bai.van_de_goc, "Bản anh sửa");
  assert.equal(c.de_bai.bo_qua_vong_hoi, false);
});

test("lối tắt: confirm ngay sau lượt 1 ghi bỏ vòng hỏi", async () => {
  const { ask } = fakeAsk([luot(1), deBai]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Q?");
  const c = await hg.confirm(s.id, null);
  assert.equal(c.de_bai.bo_qua_vong_hoi, true);
  assert.equal(c.de_bai.van_de_goc, "Q?");
});

test(`không quá ${MAX_LUOT} lượt`, async () => {
  const replies = [1, 2, 3, 4, 5, 6].map((n) => luot(n));
  const { ask } = fakeAsk(replies);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Q?");
  let r;
  for (let i = 0; i < MAX_LUOT; i++) r = await hg.answer(s.id, [{ id: "q1", chon: "A" }]);
  assert.equal(r.het_luot, true);
  assert.ok(r.de_xuat_van_de_goc.length > 0);
});

test("docTaiLieu lỗi chạy nền: không sập, confirm đi tiếp với tờ sự thật rỗng, JSON không có docPromise/docError", async () => {
  const { ask, calls } = fakeAsk([luot(1), deBai]);
  const saveDir = dir();
  const hg = createHoiGoc({ ask, docTaiLieu: async () => { throw new Error("hết quota"); }, saveDir });
  const s = await hg.start("Q?");
  const c = await hg.confirm(s.id, null);
  assert.match(calls[1].prompt, /hết quota/);
  assert.match(c.de_bai.prompt, /chưa có số liệu đã kiểm trong tài liệu/);
  assert.doesNotMatch(c.de_bai.prompt, /wiki\/a\.md|Doanh thu 1 tỷ/);
  assert.deepEqual(c.de_bai.so_lieu, []);
  assert.equal(c.de_bai.canh_bao, "Chưa đọc được tài liệu: hết quota");
  assert.match(c.de_bai.prompt, /chưa đọc được tài liệu/);
  assert.doesNotMatch(c.de_bai.prompt, /CHƯA BIẾT/); // lỗi đọc không phải "điều tài liệu không có"
  const saved = JSON.parse(fs.readFileSync(path.join(saveDir, `${s.id}.json`), "utf8"));
  assert.deepEqual(saved.facts.su_that, []);
  assert.match(saved.facts.chua_biet[0], /hết quota/);
  assert.ok(!("docPromise" in saved) && !("docError" in saved));
  assert.equal(saved.tra_loi_ban_dau, "Tăng giá");
});

test("tra_loi_ban_dau lấy từ lượt 1, lượt sau không ghi đè (prompt nhắc giá trị đã có); trống thì ghi 'chưa nêu'", async () => {
  const a = fakeAsk([luot(1), luot(2, { tra_loi_ban_dau: "Giữ giá" }), deBai]);
  const hg = createHoiGoc({ ask: a.ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Q?");
  assert.equal(hg.get(s.id).tra_loi_ban_dau, "Tăng giá");
  assert.doesNotMatch(a.calls[0].prompt, /ĐÃ GHI/);
  await hg.answer(s.id, [{ id: "q1", chon: "A" }]);
  assert.equal(hg.get(s.id).tra_loi_ban_dau, "Tăng giá");
  assert.match(a.calls[1].prompt, /CÂU TRẢ LỜI BAN ĐẦU ĐÃ GHI \(tra_loi_ban_dau\): Tăng giá, giữ nguyên trừ khi người hỏi đổi ý/);
  const t = fakeAsk([luot(1, { tra_loi_ban_dau: "" }), luot(2, { tra_loi_ban_dau: "Giữ giá" })]);
  const hg3 = createHoiGoc({ ask: t.ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s3 = await hg3.start("Q?");
  await hg3.answer(s3.id, [{ id: "q1", chon: "A" }]);
  assert.equal(hg3.get(s3.id).tra_loi_ban_dau, "Giữ giá"); // lượt 1 chưa có thì lượt sau điền
  const b = fakeAsk([luot(1, { tra_loi_ban_dau: "" }), deBai]);
  const hg2 = createHoiGoc({ ask: b.ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s2 = await hg2.start("Q?");
  const c = await hg2.confirm(s2.id, null);
  assert.equal(c.de_bai.tra_loi_ban_dau, "chưa nêu");
  assert.match(c.de_bai.prompt, /NGƯỜI HỎI CHỌN: chưa nêu/);
});

test("đề bài luôn ≤ MAX_PROMPT dù số liệu dài; số liệu bị cắt từ cuối", async () => {
  const nguon = (i) => `wiki/${i}.md#` + "y".repeat(100);
  const f20 = { ...facts, su_that: Array.from({ length: 20 }, (_, i) => ({ y: `Y${i}`, so: `Số ${i} ` + "x".repeat(1000), nguon: nguon(i), ngay: "2026-09" })) };
  const { ask } = fakeAsk([luot(1), { ...deBai, chon: f20.su_that.map((_, i) => i) }]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => f20, saveDir: dir() });
  const s = await hg.start("Q?");
  const c = await hg.confirm(s.id, null);
  assert.ok(c.de_bai.prompt.length <= MAX_PROMPT);
  assert.ok(c.de_bai.so_lieu.length > 0 && c.de_bai.so_lieu.length < 8 && c.de_bai.so_lieu[0].nguon === nguon(0));
  assert.match(c.de_bai.prompt, /wiki\/0\.md/);
  assert.doesNotMatch(c.de_bai.prompt, /wiki\/7\.md/);
});

test("lượt đầy đủ: prompt có câu hỏi gốc, lượt trước, câu người hỏi chọn, tờ sự thật và 'lượt N/5'", async () => {
  const { ask, calls } = fakeAsk([luot(1), luot(2)]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Có nên tăng giá khám?");
  await hg.get(s.id).docPromise;
  await hg.answer(s.id, [{ id: "q1", tu_go: "ý khác" }]);
  assert.match(calls[0].prompt, /lượt 1\/5/);
  assert.doesNotMatch(calls[0].prompt, /TỜ SỰ THẬT/);
  assert.match(calls[1].prompt, /Có nên tăng giá khám\?/);
  assert.match(calls[1].prompt, /Câu 1\?.*tự gõ: ý khác/);
  assert.match(calls[1].prompt, /Doanh thu: 1 tỷ \(wiki\/a\.md, 2026-09\)/);
  assert.match(calls[1].prompt, /lượt 2\/5/);
  assert.equal(calls[1].schema.properties.de_xuat_van_de_goc.type, "string");
});

test("model không hỏi gì cũng không đề xuất: chốt bằng câu hỏi gốc, không kẹt màn trống", async () => {
  const { ask } = fakeAsk([luot(1), luot(2, { cau_hoi: [] })]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Q gốc?");
  const a = await hg.answer(s.id, [{ id: "q1", chon: "A" }]);
  assert.deepEqual(a, { de_xuat_van_de_goc: "Q gốc?", het_luot: false });
});

test("số liệu dựng từ tờ sự thật theo số thứ tự model chọn: bỏ ngoài phạm vi, trùng, không phải số nguyên; nguồn thật vào prompt", async () => {
  const f2 = { ...facts, su_that: [facts.su_that[0], { y: "Khách mới", so: "120 ca/tháng", nguon: "raw/ban-hang/t9.csv", ngay: "2026-09-30" }] };
  const { ask, calls } = fakeAsk([luot(1), { ...deBai, chon: [1, 0, 99, 1, -1, 0.5] }]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => f2, saveDir: dir() });
  const s = await hg.start("Q?");
  const c = await hg.confirm(s.id, null);
  assert.deepEqual(c.de_bai.so_lieu, [
    { noi_dung: "Khách mới: 120 ca/tháng", nguon: "raw/ban-hang/t9.csv", ngay: "2026-09-30" },
    { noi_dung: "Doanh thu: 1 tỷ", nguon: "wiki/a.md", ngay: "2026-09" },
  ]);
  assert.match(c.de_bai.prompt, /- Khách mới: 120 ca\/tháng \(raw\/ban-hang\/t9\.csv, 2026-09-30\)\n- Doanh thu: 1 tỷ \(wiki\/a\.md, 2026-09\)/);
  assert.match(calls[1].prompt, /\[0\] Doanh thu: 1 tỷ \(wiki\/a\.md, 2026-09\)\n\[1\] Khách mới/); // tờ sự thật có đánh số cho model chọn
  assert.equal(calls[1].schema.properties.chon.items.type, "integer");
  assert.ok(!("so_lieu" in calls[1].schema.properties));
  assert.equal(c.de_bai.canh_bao, "");
});

test("model không chọn mục nào mà tờ sự thật có số: lấy các mục đầu (≤ 8) thay vì để hội đồng không có số", async () => {
  const { ask } = fakeAsk([luot(1), { ...deBai, chon: [] }]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Q?");
  const c = await hg.confirm(s.id, null);
  assert.equal(c.de_bai.so_lieu.length, 1);
  assert.match(c.de_bai.prompt, /Doanh thu: 1 tỷ \(wiki\/a\.md/);
});

test("prompt hội đồng có VÒNG HỎI (câu đã trả lời) và CHƯA BIẾT (≤ 4); quá dài thì bỏ CHƯA BIẾT trước, rồi VÒNG HỎI, rồi số liệu", async () => {
  const fcb = { ...facts, chua_biet: ["Biên lãi theo dịch vụ", "Giá đối thủ", "Tỉ lệ quay lại", "Chi phí cố định", "Thứ năm"] };
  const l1 = luot(1, { cau_hoi: [{ id: "q1", hoi: "Đo thành công bằng gì?", lua_chon: ["Doanh thu", "Số ca"] }, { id: "q2", hoi: "Hạn?", lua_chon: ["3 tháng"] }] });
  const { ask } = fakeAsk([l1, luot(2, { de_xuat_van_de_goc: "Giá thấp hơn chi phí sàn" }), deBai]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => fcb, saveDir: dir() });
  const s = await hg.start("Có nên tăng giá khám?");
  await hg.answer(s.id, [{ id: "q1", chon: "Doanh thu", tu_go: "trước 31/12" }]);
  const p = (await hg.confirm(s.id, null)).de_bai.prompt;
  assert.match(p, /VÒNG HỎI \(rút gọn[^\n]*\n- Đo thành công bằng gì\? → Doanh thu; tự gõ: trước 31\/12\n/);
  assert.doesNotMatch(p, /Hạn\?/); // câu chưa trả lời không vào
  assert.match(p, /CHƯA BIẾT[^\n]*\n- Biên lãi theo dịch vụ\n- Giá đối thủ\n- Tỉ lệ quay lại\n- Chi phí cố định\nPHƯƠNG ÁN/);
  assert.ok(p.indexOf("VẤN ĐỀ GỐC") < p.indexOf("VÒNG HỎI") && p.indexOf("VÒNG HỎI") < p.indexOf("SỐ LIỆU") && p.indexOf("SỐ LIỆU") < p.indexOf("CHƯA BIẾT"));

  // ép quá dài: 8 số dài + nhiều câu hỏi dài + chưa biết dài
  const dai = (c, n) => c.repeat(n);
  const fdai = { su_that: Array.from({ length: 8 }, (_, i) => ({ y: `Y${i}`, so: dai("s", 300), nguon: `wiki/${i}.md`, ngay: "2026-09" })), chua_biet: [dai("c", 300), dai("d", 300)], tra_loi_tra_cuu: "" };
  const qs = Array.from({ length: 3 }, (_, i) => ({ id: `q${i + 1}`, hoi: dai("h", 300), lua_chon: ["A"] }));
  const b = fakeAsk([luot(1, { cau_hoi: qs }), luot(2, { cau_hoi: qs }), { ...deBai, chon: [0, 1, 2, 3, 4, 5, 6, 7], phuong_an: "ABCD".split("").map((id) => ({ id, label: dai("p", 200) })) }]);
  const hg2 = createHoiGoc({ ask: b.ask, docTaiLieu: async () => fdai, saveDir: dir() });
  const s2 = await hg2.start(dai("q", 800));
  await hg2.answer(s2.id, qs.map((q) => ({ id: q.id, tu_go: dai("t", 300) })));
  const c2 = await hg2.confirm(s2.id, dai("v", 800));
  const p2 = c2.de_bai.prompt;
  assert.ok(p2.length <= MAX_PROMPT, String(p2.length));
  assert.doesNotMatch(p2, /CHƯA BIẾT|VÒNG HỎI/); // bỏ hết hai mục này trước khi đụng tới số liệu
  assert.match(p2, /^VẤN ĐỀ GỐC/);
  assert.equal(p2.match(/^[A-D]\. /gm).length, 4);
  assert.ok(c2.de_bai.so_lieu.length >= 1);
});

test("macOS chặn quyền (CLI vẫn xong, su_that rỗng, EPERM trong chua_biet): de_bai.canh_bao nói rõ, không coi là 'tài liệu không có'", async () => {
  const chan = { su_that: [], chua_biet: ["Không đọc được wiki/index.md: EPERM: operation not permitted"], tra_loi_tra_cuu: "" };
  const { ask } = fakeAsk([luot(1), deBai]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => chan, saveDir: dir() });
  const s = await hg.start("Q?");
  const c = await hg.confirm(s.id, null);
  assert.match(c.de_bai.canh_bao, /^Chưa đọc được tài liệu: macOS chưa cho app đọc thư mục Documents — mở Cài đặt hệ thống › Quyền riêng tư › Tệp và thư mục · /);
  assert.ok(c.de_bai.canh_bao.length <= 320);
  assert.doesNotMatch(c.de_bai.prompt, /CHƯA BIẾT|EPERM/);
  assert.match(c.de_bai.prompt, /chưa có số liệu đã kiểm trong tài liệu \(chưa đọc được tài liệu\)/);
});

test("bỏ vòng hỏi ở thẻ hết 5 lượt: confirm(..., { boQua: true }) ghi bo_qua_vong_hoi và lấy nguyên câu hỏi ban đầu dù đã có đề xuất", async () => {
  const { ask } = fakeAsk([luot(1), luot(2, { de_xuat_van_de_goc: "Đề xuất của Chủ toạ" }), deBai]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Câu hỏi ban đầu?");
  await hg.answer(s.id, [{ id: "q1", chon: "A" }]);
  const c = await hg.confirm(s.id, "bị bỏ qua", { boQua: true });
  assert.equal(c.de_bai.bo_qua_vong_hoi, true);
  assert.equal(c.de_bai.van_de_goc, "Câu hỏi ban đầu?");
  assert.match(c.de_bai.prompt, /^VẤN ĐỀ GỐC \(người hỏi chọn bỏ vòng hỏi, lấy nguyên câu hỏi ban đầu\): Câu hỏi ban đầu\?/);
  assert.equal(hg.get(s.id).bo_qua_vong_hoi, true);
});

test("tối đa 8 số liệu trong đề bài", async () => {
  const f12 = { ...facts, su_that: Array.from({ length: 12 }, (_, i) => ({ y: `Y${i}`, so: "1", nguon: `wiki/${i}.md`, ngay: "2026-09" })) };
  const { ask } = fakeAsk([luot(1), { ...deBai, chon: f12.su_that.map((_, i) => i) }]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => f12, saveDir: dir() });
  const s = await hg.start("Q?");
  const c = await hg.confirm(s.id, null);
  assert.equal(c.de_bai.so_lieu.length, 8);
  assert.equal(c.de_bai.so_lieu.at(-1).nguon, "wiki/7.md");
});

test("chỉ lấy 4 phương án đầu: 10 phương án dài vẫn ≤ MAX_PROMPT", async () => {
  const nhieu = Array.from({ length: 10 }, (_, i) => ({ id: "ABCD"[i % 4], label: "p".repeat(500) }));
  const { ask } = fakeAsk([luot(1), { ...deBai, phuong_an: nhieu }]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Q?");
  const c = await hg.confirm(s.id, null);
  assert.ok(c.de_bai.prompt.length <= MAX_PROMPT);
  assert.equal(c.de_bai.phuong_an.length, 4);
  assert.equal(c.de_bai.prompt.match(/^[A-D]\. /gm).length, 4);
});

test("answer chạy đồng thời: lần hai bị từ chối, chỉ có 2 lượt, không có lượt ma, cờ không nằm trong JSON", async () => {
  let n = 0, mo;
  const cho = new Promise((r) => (mo = r));
  const ask = async () => { if (++n === 1) return luot(1); await cho; return luot(2); };
  const saveDir = dir();
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir });
  const s = await hg.start("Q?");
  const p1 = hg.answer(s.id, [{ id: "q1", chon: "A" }]);
  await assert.rejects(hg.answer(s.id, [{ id: "q1", chon: "B" }]), /Đang xử lý lượt trước/);
  mo();
  const r = await p1;
  assert.equal(r.luot.so, 2);
  const st = hg.get(s.id);
  assert.equal(st.luot.length, 2);
  assert.equal(st.luot[0].tra_loi[0].chon, "A");
  assert.ok(!("dang" in JSON.parse(fs.readFileSync(path.join(saveDir, `${s.id}.json`), "utf8"))));
  assert.equal((await hg.answer(s.id, [{ id: "q1", chon: "A" }])).luot.so, 3); // cờ đã nhả
});

test("answer lỗi giữa chừng thì nhả cờ, thử lại được", async () => {
  let n = 0;
  const ask = async () => { if (++n === 2) throw new Error("CLI hỏng"); return luot(n === 1 ? 1 : 2); };
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Q?");
  await assert.rejects(hg.answer(s.id, [{ id: "q1", chon: "A" }]), /CLI hỏng/);
  const r = await hg.answer(s.id, [{ id: "q1", chon: "A" }]);
  assert.equal(r.luot.so, 2);
  assert.equal(hg.get(s.id).luot.length, 2);
});

test("answer sau khi đã có đề xuất bị từ chối, không thêm lượt, đề xuất giữ nguyên", async () => {
  const { ask, calls } = fakeAsk([luot(1), luot(2, { de_xuat_van_de_goc: "Giá thấp hơn chi phí sàn" }), luot(3)]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Q?");
  await hg.answer(s.id, [{ id: "q1", chon: "A" }]);
  await assert.rejects(hg.answer(s.id, [{ id: "q1", chon: "B" }]), /Đã có đề xuất vấn đề gốc/);
  const st = hg.get(s.id);
  assert.equal(st.luot.length, 1);
  assert.equal(st.deXuat, "Giá thấp hơn chi phí sàn");
  assert.equal(calls.length, 2);
  assert.equal(st.luot[0].tra_loi[0].chon, "A");
});

test("lời hỏi gốc mang kiến thức của Chủ toạ (não của chính ông), lượt sau cũng vậy", async () => {
  delete process.env.HOI_BRAIN;
  const { ask, calls } = fakeAsk([luot(1), luot(2)]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => facts, saveDir: dir() });
  const s = await hg.start("Có nên tăng giá khám?");
  await hg.answer(s.id, [{ id: "q1", chon: "A" }]);
  for (const c of calls) {
    assert.match(c.system, /KIẾN THỨC CỦA CHỦ TOẠ/);
    assert.match(c.system, /===== brains\/elon-musk\/_hot\.md =====/);
    assert.match(c.system, /===== brains\/elon-musk\/frameworks\.md =====/);
    assert.match(c.system, /idiot index/i);
    assert.match(c.system, /xoá/);
  }
  assert.doesNotMatch(calls[0].system, /phong cách Elon Musk/);
});

test("HOI_BRAIN=nho: chỉ nạp _hot và principles (khi lượt hỏi chậm)", async () => {
  process.env.HOI_BRAIN = "nho";
  try {
    const { systemHoi } = await import("../lib/hoi-goc.mjs");
    const t = systemHoi();
    assert.match(t, /brains\/elon-musk\/_hot\.md/);
    assert.match(t, /brains\/elon-musk\/principles\.md/);
    assert.doesNotMatch(t, /brains\/elon-musk\/frameworks\.md/);
  } finally { delete process.env.HOI_BRAIN; }
});

test("số liệu: mô tả đã kết thúc câu thì không thêm dấu hai chấm", async () => {
  const f = { su_that: [{ y: "Tháng 8 chi gấp 2,2 lần T7.", so: "chi ×2,17", nguon: "p", ngay: "" }, { y: "Doanh thu", so: "1 tỷ", nguon: "q", ngay: "" }], chua_biet: [], tra_loi_tra_cuu: "" };
  const { ask } = fakeAsk([luot(1), { ...deBai, chon: [0, 1] }]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => f, saveDir: dir() });
  const s = await hg.start("Q?");
  const c = await hg.confirm(s.id, null);
  assert.deepEqual(c.de_bai.so_lieu.map((x) => x.noi_dung), ["Tháng 8 chi gấp 2,2 lần T7. chi ×2,17", "Doanh thu: 1 tỷ"]);
});

test("đề bài: mục SỐ LIỆU THƯ KÝ TRÌNH ghi nguồn là thư mục tài liệu; CHƯA BIẾT về de_bai.chua_biet để thư ký báo thiếu (lỗi đọc thì không)", async () => {
  const f = { ...facts, chua_biet: ["Giá vốn mỗi đơn"] };
  const { ask } = fakeAsk([luot(1), deBai]);
  const hg = createHoiGoc({ ask, docTaiLieu: async () => f, saveDir: dir() });
  const s = await hg.start("Q?");
  const c = await hg.confirm(s.id, null);
  assert.match(c.de_bai.prompt, /SỐ LIỆU THƯ KÝ TRÌNH \(nguồn: thư mục tài liệu của người hỏi\):\n- Doanh thu: 1 tỷ/);
  assert.match(c.de_bai.prompt, /CHƯA BIẾT[^\n]*\n- Giá vốn mỗi đơn/);
  assert.deepEqual(c.de_bai.chua_biet, ["Giá vốn mỗi đơn"]);
  const chan = { su_that: [], chua_biet: ["Không đọc được README.md: EPERM: operation not permitted"], tra_loi_tra_cuu: "" };
  const b = fakeAsk([luot(1), deBai]);
  const hg2 = createHoiGoc({ ask: b.ask, docTaiLieu: async () => chan, saveDir: dir() });
  const s2 = await hg2.start("Q?");
  const c2 = await hg2.confirm(s2.id, null);
  assert.deepEqual(c2.de_bai.chua_biet, []);
});
