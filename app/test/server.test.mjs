import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import net from "node:net"; import http from "node:http";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "server-test-"));
const replyFile = path.join(tmp, "reply.json");
const reply = { loai: "tra_cuu", tra_loi_ban_dau: "", nhan_xet_so: "", cau_hoi: [], de_xuat_van_de_goc: "", su_that: [{ y: "Doanh thu", so: "1 tỷ", nguon: "wiki/a.md", ngay: "2026-09" }], chua_biet: [], tra_loi_tra_cuu: "Doanh thu 1 tỷ (wiki/a.md)." };
fs.writeFileSync(replyFile, JSON.stringify(reply));

// A second room in api mode, with a decision-shaped reply (one object answers every call of the hỏi flow).
const replyApi = path.join(tmp, "reply-api.json");
fs.writeFileSync(replyApi, JSON.stringify({ ...reply, loai: "chien_luoc", cau_hoi: [{ id: "q1", hoi: "Đo bằng gì?", lua_chon: ["Doanh thu"] }], de_xuat_van_de_goc: "Đề xuất của Chủ toạ", title: "Tăng giá", phuong_an: [{ id: "A", label: "Tăng" }, { id: "B", label: "Giữ nguyên" }], chon: [0] }));

const kids = [];
let base, port, baseApi;
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); s.on("error", rej); });
const post = (p, body, b = base) => fetch(b + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// A finished council saved before the test: the one a follow-up (họp tiếp) starts from.
const SESSIONS = path.join(tmp, "sessions");
fs.mkdirSync(path.join(SESSIONS, "2026-10-25-cu"), { recursive: true });
fs.writeFileSync(path.join(SESSIONS, "2026-10-25-cu", "events.json"), JSON.stringify({ id: "2026-10-25-cu", prompt: "Đề bài gốc đủ dài để họp", mode: "quick", status: "done", events: [{ type: "verdict", verdict: { label: "GO", call: "Làm", conditions: [] } }] }));

// A finished council with a phiếu inside PHIEU_DIR (its path is stored relative to the repo root, like the real ones),
// a sổ row pointing at it, and a council with no verdict.
const PHIEU = path.join(tmp, "phieu");
const TAI_LIEU = path.join(tmp, "tai-lieu");
fs.mkdirSync(TAI_LIEU, { recursive: true });
fs.mkdirSync(PHIEU, { recursive: true });
fs.writeFileSync(path.join(PHIEU, "2026-10-25-hoi-dong-tang-gia.md"), "# Tăng giá\n\n## Kết luận\n\nLàm\n");
fs.writeFileSync(path.join(PHIEU, "00-so-phieu.md"), "# Sổ\n\n| Ngày | Câu hỏi | Kết luận | Hạn xem lại | Trạng thái | File |\n|---|---|---|---|---|---|\n| 2026-10-25 | Có nên tăng giá? | Làm | 2026-11-24 | mo | [file](2026-10-25-hoi-dong-tang-gia.md) |\n");
fs.mkdirSync(path.join(SESSIONS, "2026-10-25-co-phieu"), { recursive: true });
fs.writeFileSync(path.join(SESSIONS, "2026-10-25-co-phieu", "events.json"), JSON.stringify({ id: "2026-10-25-co-phieu", prompt: "Đề bài gốc có phiếu", mode: "quick", status: "done", title: "Tăng giá", events: [{ type: "verdict", verdict: { label: "GO", call: "Làm", conditions: [] } }, { type: "phieu", path: path.relative(root, path.join(PHIEU, "2026-10-25-hoi-dong-tang-gia.md")) }] }));
fs.mkdirSync(path.join(SESSIONS, "2026-10-25-chua-xong"), { recursive: true });
fs.writeFileSync(path.join(SESSIONS, "2026-10-25-chua-xong", "events.json"), JSON.stringify({ id: "2026-10-25-chua-xong", prompt: "Đề bài", mode: "quick", status: "error", events: [] }));
// One fake reply that fits every call of a quick council: setup, seats, cruxes, verdict, Chair view.
const replyFull = path.join(tmp, "reply-full.json");
fs.writeFileSync(replyFull, JSON.stringify({
  title: "Tăng giá", decision: "Có tăng giá không", brief: "b", options: [{ id: "A", label: "Tăng" }, { id: "B", label: "Giữ" }], assumptions: [], weights: [],
  quick_seats: ["buffett", "bezos", "graham", "hormozi"], seats: [], cruxes: [], unanimous: false, note: "", pressure: [],
  label: "RESHAPE", call: "Chỉ tăng ca tối.", override_note: "", why: [], fights: [], minority: { seat: "buffett", quote: "q", would_have_to_be_true: "w" }, amendments: [],
  conditions: ["Đo 14 ngày"], next_steps: [], cheapest_test: "t", kill_criteria: "k", revisit: "r",
  dong_y: "đồng ý", nhan_dinh: "Hợp lý.", ly_do: [], bo_buoc: "", thu_nhanh: "",
}));

async function startServer(runner, replyPath, extraEnv = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ["app/server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), CLAUDE_BIN: path.join(root, "app", "test", "fake-claude.mjs"), FAKE_CLAUDE_REPLY: replyPath, TAI_LIEU_DIR: TAI_LIEU, HOI_GOC_DIR: path.join(tmp, "hoi-goc"), SESSIONS_DIR: SESSIONS, PHIEU_DIR: path.join(tmp, "phieu"), CLAUDE_CODE_OAUTH_TOKEN: "test-token", COUNCIL_RUNNER: runner, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  kids.push(child);
  await new Promise((res, rej) => {
    let out = "";
    const t = setTimeout(() => rej(new Error("server không lên: " + out)), 10000);
    child.stdout.on("data", (c) => { out += c; if (out.includes("on http://localhost")) { clearTimeout(t); res(); } });
    child.stderr.on("data", (c) => { out += c; });
    child.on("exit", (code) => { clearTimeout(t); rej(new Error(`server thoát (${code}): ${out}`)); });
  });
  return port;
}

before(async () => {
  port = await startServer("viewer", replyFile);
  base = `http://127.0.0.1:${port}`;
  baseApi = `http://127.0.0.1:${await startServer("api", replyApi)}`;
});

after(() => { for (const c of kids) { c.removeAllListeners("exit"); c.kill(); } });

test("POST /api/hoi: câu tra cứu trả về loai tra_cuu", async () => {
  const r = await post("/api/hoi", { cau_hoi: "Doanh thu T9 bao nhiêu?" });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.loai, "tra_cuu");
  assert.match(j.tra_loi, /1 tỷ/);
});

test("POST /api/hoi: câu hỏi quá ngắn bị từ chối", async () => {
  const r = await post("/api/hoi", { cau_hoi: "ơ" });
  assert.equal(r.status, 400);
});

test("POST /api/hoi/:id/chot và /tra-loi với id không có: 404", async () => {
  const a = await post("/api/hoi/khong-co/chot", { van_de_goc: "x" });
  assert.equal(a.status, 404);
  assert.equal((await a.json()).error, "Không tìm thấy lượt hỏi");
  const b = await post("/api/hoi/khong-co/tra-loi", { tra_loi: [] });
  assert.equal(b.status, 404);
});

test("POST /api/hoi: JSON hỏng là 400, không phải 500", async () => {
  const r = await fetch(base + "/api/hoi", { method: "POST", headers: { "content-type": "application/json" }, body: "{hỏng" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "Dữ liệu gửi lên không hợp lệ");
  const a = await post("/api/hoi/%E0%A4%A/chot", { van_de_goc: "x" });
  assert.equal(a.status, 404);
});

test("POST không phải application/json: 415 (chặn trang web khác bắn chéo vào 127.0.0.1)", async () => {
  for (const p of ["/api/hoi", "/api/hoi/x/tra-loi", "/api/hoi/x/chot", "/api/council", "/api/council/x/tiep"]) {
    const r = await fetch(base + p, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ cau_hoi: "Doanh thu T9 bao nhiêu?", prompt: "Một quyết định đủ dài để qua kiểm tra" }) });
    assert.equal(r.status, 415, p);
    assert.equal((await r.json()).error, "Cần Content-Type: application/json");
  }
  const r = await fetch(base + "/api/hoi", { method: "POST", body: "{}" });
  assert.equal(r.status, 415);
});

test("POST /api/hoi/:id/tra-loi trên phiên tra_cuu: 409", async () => {
  const { id } = await (await post("/api/hoi", { cau_hoi: "Doanh thu T9 bao nhiêu?" })).json();
  const r = await post(`/api/hoi/${id}/tra-loi`, { tra_loi: [{ id: "q1", chon: "A" }] });
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /vòng hỏi/);
});

test("GET /api/seats có chair", async () => {
  const j = await (await fetch(base + "/api/seats")).json();
  assert.equal(typeof j.chair, "string");
  assert.ok(j.chair.length > 0);
});

test("GET /api/seats có thư ký (đứng sau Chủ toạ, không phải ghế, đủ bốn khung miệng)", async () => {
  const j = await (await fetch(base + "/api/seats")).json();
  assert.equal(j.thu_ky.key, "thuky");
  assert.equal(j.thu_ky.name, "Thư ký");
  assert.deepEqual(Object.keys(j.thu_ky.portraits).sort(), ["base", "blink", "mid", "open"]);
  assert.ok(!j.seats.some((s) => s.key === "thuky"));
});

const getHost = (host) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port, path: "/api/seats", headers: { host } }, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res({ status: r.statusCode, body: b })); }).on("error", rej);
});

test("Host lạ (DNS rebinding) bị chặn 403; localhost:PORT và 127.0.0.1:PORT vào được", async () => {
  for (const h of [`evil.example:${port}`, "localhost", `localhost:${port + 1}`, `127.0.0.1.nip.io:${port}`]) {
    const r = await getHost(h);
    assert.equal(r.status, 403, h);
    assert.equal(JSON.parse(r.body).error, "Host không hợp lệ");
  }
  for (const h of [`localhost:${port}`, `127.0.0.1:${port}`]) assert.equal((await getHost(h)).status, 200, h);
  const raw = await new Promise((res, rej) => { // HTTP/1.0 with no Host header at all
    const c = net.connect(port, "127.0.0.1", () => c.end("GET /api/seats HTTP/1.0\r\n\r\n"));
    let b = ""; c.on("data", (d) => (b += d)); c.on("end", () => res(b)); c.on("error", rej);
  });
  assert.match(raw, /^HTTP\/1\.[01] 403/);
});

test("POST /api/council với hoi_id không còn (server vừa khởi động lại): 409 rõ ràng, không họp", async () => {
  const r = await post("/api/council", { prompt: "Một quyết định đủ dài để qua kiểm tra", hoi_id: "khong-con" }, baseApi);
  assert.equal(r.status, 409);
  const j = await r.json();
  assert.equal(j.error, "Phiên hỏi đã hết hạn (server vừa khởi động lại). Hỏi lại từ đầu.");
  assert.equal(j.code, "hoi_het_han");
  assert.equal((await (await fetch(baseApi + "/api/sessions")).json()).running, null);
});

test("POST /api/hoi/:id/chot với bo_qua: true (thẻ hết lượt, 'Chạy hội đồng luôn'): bỏ vòng hỏi, lấy nguyên câu hỏi dù đã có đề xuất", async () => {
  const q = "Có nên tăng giá khám thai không?";
  const s = await (await post("/api/hoi", { cau_hoi: q }, baseApi)).json();
  assert.equal(s.luot.so, 1);
  const a = await (await post(`/api/hoi/${s.id}/tra-loi`, { tra_loi: [{ id: "q1", chon: "Doanh thu" }] }, baseApi)).json();
  assert.equal(a.de_xuat_van_de_goc, "Đề xuất của Chủ toạ");
  const r = await post(`/api/hoi/${s.id}/chot`, { van_de_goc: null, bo_qua: true }, baseApi);
  assert.equal(r.status, 200);
  const { de_bai } = await r.json();
  assert.equal(de_bai.bo_qua_vong_hoi, true);
  assert.equal(de_bai.van_de_goc, q);
  assert.deepEqual(de_bai.so_lieu, [{ noi_dung: "Doanh thu: 1 tỷ", nguon: "wiki/a.md", ngay: "2026-09" }]);
  assert.equal(de_bai.canh_bao, "");
});

test("POST /api/council/:id/tiep: 403 ở chế độ xem, 404 phiên lạ, 400 bổ sung ngắn", async () => {
  assert.equal((await post("/api/council/2026-10-25-cu/tiep", { bo_sung: "Thêm số liệu mới" })).status, 403);
  const a = await post("/api/council/khong-co/tiep", { bo_sung: "Thêm số liệu mới" }, baseApi);
  assert.equal(a.status, 404);
  assert.equal((await a.json()).error, "Không thấy phiên này");
  const b = await post("/api/council/2026-10-25-cu/tiep", { bo_sung: "ơ" }, baseApi);
  assert.equal(b.status, 400);
  assert.match((await b.json()).error, /ít nhất 5 ký tự/);
});

test("POST /api/council/:id/tiep khi đang có hội đồng họp: 409", async () => {
  const slow = `http://127.0.0.1:${await startServer("api", replyApi, { FAKE_CLAUDE_DELAY_MS: "5000" })}`;
  assert.equal((await post("/api/council", { prompt: "Một quyết định đủ dài để qua kiểm tra" }, slow)).status, 200);
  const r = await post("/api/council/2026-10-25-cu/tiep", { bo_sung: "Thêm số liệu mới" }, slow);
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /Đang có một hội đồng họp/);
});

test("POST /api/council/:id/tiep: phiên chưa có kết luận thì 409", async () => {
  const r = await post("/api/council/2026-10-25-chua-xong/tiep", { bo_sung: "Thêm số liệu mới" }, baseApi);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, "Phiên này chưa có kết luận.");
});

test("họp tiếp trọn luồng: lan 2, phiên mới lưu liên kết, phiếu cũ có 'Lần họp 2', sổ đổi đúng dòng, phiên gốc vẫn còn", async () => {
  const full = `http://127.0.0.1:${await startServer("api", replyFull)}`;
  const r = await post("/api/council/2026-10-25-co-phieu/tiep", { bo_sung: "Ca tối đã kín 90%." }, full);
  assert.equal(r.status, 200);
  const { id, lan } = await r.json();
  assert.equal(lan, 2);
  for (let i = 0; i < 100 && (await (await fetch(full + "/api/sessions")).json()).running; i++) await new Promise((x) => setTimeout(x, 100));
  const j = await (await fetch(`${full}/api/sessions/${id}`)).json();
  assert.equal(j.status, "done");
  assert.deepEqual([j.parent, j.lan, j.goc_prompt, j.phieu, j.bo_sung], ["2026-10-25-co-phieu", 2, "Đề bài gốc có phiếu", path.relative(root, path.join(PHIEU, "2026-10-25-hoi-dong-tang-gia.md")), "Ca tối đã kín 90%."]);
  const ev = j.events.find((e) => e.type === "phieu");
  assert.equal(ev.cap_nhat, true);
  assert.equal(ev.so_doi, true);
  assert.ok(j.events.some((e) => e.type === "chair_view" && e.view?.dong_y === "đồng ý"));
  const phieu = fs.readFileSync(path.join(PHIEU, "2026-10-25-hoi-dong-tang-gia.md"), "utf8");
  assert.match(phieu, /## Lần họp 2 \(\d{4}-\d{2}-\d{2}\)\n\n\*\*Bổ sung:\*\* Ca tối đã kín 90%\./);
  assert.match(fs.readFileSync(path.join(PHIEU, "00-so-phieu.md"), "utf8"), /\| Có nên tăng giá\? \| \(họp lần 2 \d\d\/\d\d\) Chỉ tăng ca tối\. \|/);
  assert.equal((await fetch(`${full}/api/sessions/2026-10-25-co-phieu`)).status, 200);
});
