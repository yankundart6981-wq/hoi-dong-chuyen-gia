import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { APP_ROOT, REPO_ROOT, env } from "./lib/env.mjs";
import { loadRoster, BOARD } from "./lib/seats.mjs";
import { startCouncil, getSession, subscribe, listSaved, loadSaved, MODELS, chairSeat } from "./lib/council.mjs";
import { usage } from "./lib/anthropic.mjs";
import * as watch from "./lib/watch.mjs";
import { startHoiGocApp } from "./lib/hoi-goc.mjs";
import { ghiPhieu, ghiHopTiep, phieuTrongThuMuc } from "./lib/phieu.mjs";
import { gocCuaPhien, promptHopTiep, lanKeTiep } from "./lib/hop-tiep.mjs";

const PORT = Number(process.env.PORT) || 4730;
const PUBLIC = path.join(APP_ROOT, "public");
// DNS rebinding: a page on another name that resolves to 127.0.0.1 would be same-origin, so only these Host headers get in.
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8" };

let running = null; // one council at a time (API runner)
const dangHop = () => Boolean(running && getSession(running)?.status === "running");
// PHIEU_DIR moves the phiếu and its sổ elsewhere (a test run writes to a copy, never the real sổ).
const phieuDir = () => path.resolve(env("PHIEU_DIR") || path.join(REPO_ROOT, "phieu"));
const homNay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

// "viewer" (default): the room plays councils that /roast-room runs in Claude Code.
// "api": the room can also run councils itself on ANTHROPIC_API_KEY (COUNCIL_RUNNER=api in .env).
const RUNNER = (process.env.COUNCIL_RUNNER || env("COUNCIL_RUNNER") || "viewer").toLowerCase() === "api" ? "api" : "viewer";
watch.startWatching();
const hoiGoc = startHoiGocApp();

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const badBody = () => Object.assign(new Error("Dữ liệu gửi lên không hợp lệ"), { status: 400 });
async function readJson(req) {
  let raw = "";
  for await (const c of req) { raw += c; if (raw.length > 1e5) throw badBody(); }
  if (!raw) return {};
  let j;
  try { j = JSON.parse(raw); } catch { throw badBody(); }
  if (!j || typeof j !== "object" || Array.isArray(j)) throw badBody();
  return j;
}

const server = http.createServer(async (req, res) => {
  if (!HOSTS.has(String(req.headers.host ?? "").toLowerCase())) return send(res, 403, { error: "Host không hợp lệ" });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    // A web page open in the browser can fire cross-site text/plain POSTs at 127.0.0.1; JSON needs a CORS preflight, which this server never approves.
    if (req.method === "POST" && /^\/api\/(hoi|council)(\/|$)/.test(p) && !/^application\/json/i.test(req.headers["content-type"] || "")) return send(res, 415, { error: "Cần Content-Type: application/json" });
    if (p === "/api/seats") {
      // portraits: which of the four mouth shapes exist for each seat (a seat with none gets a drawn bust)
      const frame = (key, sh) => ["webp", "png", "jpg"].map((x) => `${key}-${sh}.${x}`).find((f) => fs.existsSync(path.join(PUBLIC, "portraits", f)));
      const seats = loadRoster().map((s) => ({ ...s, portraits: Object.fromEntries(["base", "open", "mid", "blink"].map((sh) => [sh, frame(s.key, sh)]).filter(([, f]) => f).map(([sh, f]) => [sh, `/portraits/${f}`])) }));
      // the secretary stands behind the Chair and reads out the numbers; not a seat, never votes
      const tk = Object.fromEntries(["base", "open", "mid", "blink"].map((sh) => [sh, frame("thuky", sh)]).filter(([, f]) => f).map(([sh, f]) => [sh, `/portraits/${f}`]));
      const thu_ky = { key: "thuky", name: "Thư ký", short: "Thư ký", initials: "TK", color: "#7c8fa6", portraits: tk };
      return send(res, 200, { seats, board: BOARD, models: MODELS, runner: RUNNER, chair: chairSeat(), thu_ky, hasKey: Boolean(env("ANTHROPIC_API_KEY") || env("CLAUDE_CODE_OAUTH_TOKEN")) });
    }
    if (p === "/api/usage") return send(res, 200, usage);
    if (p === "/api/hoi" && req.method === "POST") {
      const { cau_hoi } = await readJson(req);
      const q = String(cau_hoi ?? "").trim().slice(0, 2000);
      if (q.length < 5) return send(res, 400, { error: "Bạn nhập câu hỏi dài hơn một chút." });
      return send(res, 200, await hoiGoc.start(q));
    }
    const vong = p.match(/^\/api\/hoi\/([^/]+)\/(tra-loi|chot)$/);
    if (vong && req.method === "POST") {
      let id;
      try { id = decodeURIComponent(vong[1]); } catch { return send(res, 404, { error: "Không tìm thấy lượt hỏi" }); }
      if (!hoiGoc.get(id)) return send(res, 404, { error: "Không tìm thấy lượt hỏi" });
      const body = await readJson(req);
      try {
        if (vong[2] === "chot") {
          const boQua = body.bo_qua === true;
          return send(res, 200, await hoiGoc.confirm(id, boQua ? null : String(body.van_de_goc ?? "").slice(0, 2000), { boQua }));
        }
        if (!Array.isArray(body.tra_loi)) return send(res, 400, { error: "Thiếu tra_loi." });
        const tl = body.tra_loi.filter((t) => t && typeof t === "object" && t.id).map((t) => ({ id: String(t.id), chon: String(t.chon ?? "").slice(0, 1000), tu_go: String(t.tu_go ?? "").slice(0, 1000) }));
        return send(res, 200, await hoiGoc.answer(id, tl));
      } catch (e) {
        return send(res, 409, { error: String(e.message || e) });
      }
    }
    if (p === "/api/council" && req.method === "POST") {
      if (RUNNER !== "api") return send(res, 403, { error: "This room is a viewer. Run /roast-room in Claude Code, or set COUNCIL_RUNNER=api in .env." });
      const { prompt, mode, hoi_id } = await readJson(req);
      if (!prompt || prompt.trim().length < 10) return send(res, 400, { error: "Give the council a real decision (at least a sentence)." });
      // hỏi state lives in memory: after a restart the phiếu could not be written, so say so instead of running unrecorded
      const hoi = hoi_id ? hoiGoc.get(String(hoi_id)) : null;
      if (hoi_id && !hoi) return send(res, 409, { error: "Phiên hỏi đã hết hạn (server vừa khởi động lại). Hỏi lại từ đầu.", code: "hoi_het_han" });
      // checked after the body is read, with no await before `running` is set, so two requests cannot both start one
      if (dangHop()) return send(res, 409, { error: "A council is already in session. Wait for its verdict." });
      const s = startCouncil(prompt.trim().slice(0, 4000), mode === "quick" ? "quick" : "full");
      running = s.id;
      // run() calls this after the verdict and before the stream ends; it reports { path } or throws, and the page shows which
      if (hoi) s.onDone = (x) => {
        const ev = [...x.events].reverse().find((e) => e.type === "verdict");
        if (!ev) throw new Error("Hội đồng chưa có kết luận");
        const setup = x.events.find((e) => e.type === "setup");
        const cv = x.events.find((e) => e.type === "chair_view");
        const file = ghiPhieu({ dir: phieuDir(), hoi, setup, verdict: ev.verdict, chairView: cv?.view || null, chairQuotes: cv?.quotes || [], chairKiemSo: cv?.kiem_so || null, sessionId: x.id, today: homNay() });
        return { path: path.relative(REPO_ROOT, file) };
      };
      return send(res, 200, { id: s.id });
    }
    // Họp tiếp: the asker adds what was missing after a verdict and the council sits again on the same
    // problem, in the same mode, writing into the same phiếu. No hỏi rounds, no document read.
    const tiep = p.match(/^\/api\/council\/([^/]+)\/tiep$/);
    if (tiep && req.method === "POST") {
      if (RUNNER !== "api") return send(res, 403, { error: "Phòng đang ở chế độ xem nên chưa họp tiếp được (cần COUNCIL_RUNNER=api trong .env)." });
      let id;
      try { id = decodeURIComponent(tiep[1]); } catch { return send(res, 404, { error: "Không thấy phiên này" }); }
      const src = getSession(id) || loadSaved(id);
      if (!src) return send(res, 404, { error: "Không thấy phiên này" });
      const { bo_sung } = await readJson(req);
      const boSung = String(bo_sung ?? "").trim().slice(0, 2000);
      if (boSung.length < 5) return send(res, 400, { error: "Bạn viết phần bổ sung ít nhất 5 ký tự." });
      const g = gocCuaPhien(src);
      if (!g.verdict) return send(res, 409, { error: "Phiên này chưa có kết luận." });
      // the phiếu must sit in the phiếu folder in use; if not, the council still runs and the page says why the phiếu was not touched
      let file = null, loiPhieu = null;
      if (g.phieu) { try { file = phieuTrongThuMuc(phieuDir(), path.resolve(REPO_ROOT, g.phieu)); } catch (e) { loiPhieu = e; } }
      const lan = file ? lanKeTiep(fs.readFileSync(file, "utf8"), g.lan) : g.lan + 1;
      if (dangHop()) return send(res, 409, { error: "Đang có một hội đồng họp. Chờ kết luận rồi họp tiếp." });
      const s = startCouncil(promptHopTiep({ lan, boSung, boSungTruoc: g.bo_sung_truoc, verdict: g.verdict, chairView: g.chairView, gocPrompt: g.goc_prompt }), g.mode,
        { parent: id, lan, goc_prompt: g.goc_prompt, phieu: g.phieu, bo_sung: boSung, bo_sung_truoc: g.bo_sung_truoc });
      running = s.id;
      if (g.phieu) s.onDone = (x) => {
        x.cap_nhat = true;
        if (loiPhieu) throw loiPhieu;
        const ev = [...x.events].reverse().find((e) => e.type === "verdict");
        if (!ev) throw new Error("Hội đồng chưa có kết luận");
        const cv = x.events.find((e) => e.type === "chair_view");
        const r = ghiHopTiep({ dir: path.dirname(file), file, lan, boSung, setup: x.events.find((e) => e.type === "setup"), verdict: ev.verdict, chairView: cv?.view || null, quotes: cv?.quotes || [], chairKiemSo: cv?.kiem_so || null, today: homNay() });
        return { path: g.phieu, cap_nhat: true, so_doi: r.so };
      };
      return send(res, 200, { id: s.id, lan });
    }
    if (p.startsWith("/api/stream/")) {
      const id = decodeURIComponent(p.split("/").pop());
      const s = getSession(id) || watch.getLive(id);
      if (!s) return send(res, 404, { error: "no such session" });
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(": connected\n\n");
      const ping = setInterval(() => res.write(": ping\n\n"), 15000);
      res.on("close", () => clearInterval(ping));
      return subscribe(s, res);
    }
    if (p === "/api/sessions") {
      const all = [...listSaved(), ...watch.listLive()].sort((a, b) => (a.id < b.id ? 1 : -1));
      const apiRunning = running && getSession(running)?.status === "running" ? running : null;
      return send(res, 200, { sessions: all, running: apiRunning, live: watch.runningId() });
    }
    if (p.startsWith("/api/sessions/")) {
      const id = decodeURIComponent(p.split("/").pop());
      const x = watch.getLive(id);
      const j = loadSaved(id) || (x && { id, title: x.title, mode: x.mode, status: x.status, events: x.events });
      return j ? send(res, 200, j) : send(res, 404, { error: "not found" });
    }
    // static
    const file = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : p));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "Not found", "text/plain");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, e.status || 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`Hội đồng chuyên gia on http://localhost:${PORT} (${RUNNER === "api" ? "viewer + API runner" : "viewer: run /roast-room in Claude Code"})`));
