import { test } from "node:test";
import assert from "node:assert/strict";
delete process.env.CHAIR_SEAT;
const { addChairView } = await import("../lib/council.mjs");

const st = {
  decision: "Tăng giá", options: [{ id: "A", label: "Tăng" }, { id: "B", label: "Giữ" }], brief: "b", assumptions: [],
  seats: [], cards: { 1: {}, 2: {}, 3: {} }, weights: {}, rounds: [1, 2],
  verdict: { label: "GO", call: "Tăng 10%.", recommended: "A", scores: { A: { score: 7.6 }, B: { score: 3 } }, conditions: ["Khách giảm dưới 5%"] },
};
const phien = () => {
  const seen = [];
  return { seen, s: { events: [], started: Date.now(), subs: new Set([{ write: (l) => seen.push(JSON.parse(l.slice(6))) }]) } };
};
const view = {
  dong_y: "đồng ý có điều kiện", nhan_dinh: "Làm, nhưng xoá bước duyệt giá trước.",
  ly_do: [{ y: "Câu bịa \"this sentence is not anywhere in the brain at all\" (S014)", khung: "thuật toán 5 bước", nguon: "S014" }],
  bo_buoc: "Bỏ bước duyệt giá hai tầng.", thu_nhanh: "Thử 14 ngày ở một ca.",
};

test("addChairView: Chủ toạ nói bằng não của mình, phát chair_view có view, câu trích sai bị gắn cờ", async () => {
  const { s, seen } = phien();
  let req;
  await addChairView(s, st, async (o) => { req = o; return view; });
  assert.equal(seen[0].type, "phase");
  assert.equal(seen[0].phase, "chair_view");
  const ev = seen.find((e) => e.type === "chair_view");
  assert.equal(ev.view.dong_y, "đồng ý có điều kiện");
  assert.equal(ev.quotes.length, 1);
  assert.equal(ev.quotes[0].verified, false);
  assert.match(req.prompt, /KẾT LUẬN CỦA HỘI ĐỒNG/);
  assert.match(req.prompt, /Tăng 10%\./);
  assert.match(req.prompt, /không đổi kết luận/);
  assert.match(JSON.stringify(req.system), /brains\/elon-musk\/_hot\.md/);
  assert.deepEqual(req.schema.properties.dong_y.enum, ["đồng ý", "đồng ý có điều kiện", "không đồng ý"]);
  assert.deepEqual(Object.keys(req.schema.properties), ["dong_y", "nhan_dinh", "ly_do", "bo_buoc", "thu_nhanh", "so_lieu"]);
  assert.match(req.prompt, /NUMBERS RULE/);
  assert.equal(s.events.at(-1).type, "chair_view");
});

test("addChairView lỗi thì phát chair_view có error, không ném", async () => {
  const { s, seen } = phien();
  const err = console.error; console.error = () => {};
  try { await addChairView(s, st, async () => { throw new Error("hết hạn mức"); }); } finally { console.error = err; }
  const ev = seen.find((e) => e.type === "chair_view");
  assert.match(ev.error, /hết hạn mức/);
  assert.ok(!("view" in ev));
});

test("addChairView: Chủ toạ thấy điểm vênh và thẻ vòng 2 (không chỉ phiếu vòng 3); quá hạn thì báo lỗi, không treo", async () => {
  const st3 = { ...st, seats: ["buffett"], weights: { buffett: { weight: 2 } }, rounds: [1, 2, 3], cruxes: [{ question: "Giá có phải nút thắt?" }],
    cards: { 1: {}, 2: { buffett: { text: "THẺ VÒNG HAI CỦA BUFFETT" } }, 3: { buffett: { text: "PHIẾU VÒNG BA CỦA BUFFETT" } } } };
  const { s } = phien();
  let req;
  await addChairView(s, st3, async (o) => { req = o; return view; });
  assert.match(req.prompt, /Giá có phải nút thắt\?/);
  assert.match(req.prompt, /THẺ VÒNG HAI CỦA BUFFETT/);
  assert.match(req.prompt, /PHIẾU VÒNG BA CỦA BUFFETT/);
  const { s: s2, seen } = phien();
  const err = console.error; console.error = () => {};
  try { await addChairView(s2, st, () => new Promise(() => {}), { timeoutMs: 30 }); } finally { console.error = err; }
  assert.match(seen.find((e) => e.type === "chair_view").error, /quá/);
});

test("addChairView: Chủ toạ thấy nguyên văn đề bài kèm tờ số liệu; số không nguồn trong góc nhìn bị gắn cờ", async () => {
  const stSo = { ...st, prompt: "SỐ LIỆU THƯ KÝ TRÌNH:\n- Doanh thu T10: 1.698.960.000 (ban-hang/t10.csv)\n- Đơn T10: 1.096", verdict: { ...st.verdict, so_lieu: [] } };
  const { s, seen } = phien();
  let req;
  const vSo = { ...view, nhan_dinh: "Thu 1.698.960.000 trên 1.096 đơn, ngành thường 35% quay lại.", ly_do: [], so_lieu: [] };
  await addChairView(s, stSo, async (o) => { req = o; return vSo; });
  assert.match(req.prompt, /THE FOUNDER'S BRIEF, VERBATIM[\s\S]*1\.698\.960\.000/);
  const ev = seen.find((e) => e.type === "chair_view");
  assert.deepEqual(ev.kiem_so.chua_nguon.map((x) => x.so), ["35%"]);
});
