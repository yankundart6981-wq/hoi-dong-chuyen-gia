import { downloadVerdictPdf } from "./pdf.js";
import { loiVi } from "./loi-vi.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SAMPLES = [
  ["Tăng giá?", "Tôi làm dịch vụ tư vấn, doanh thu 750 triệu/tháng với 15 khách, mỗi khách 50 triệu. Tôi muốn tăng lên 85 triệu. Phương án: tăng cho tất cả ngay, chỉ tăng cho khách mới, hoặc giữ 50 triệu. Tỉ lệ chốt qua cuộc gọi khoảng 50%. Tôi đang nghiêng về tăng cho tất cả vì thấy mình đang lấy giá thấp."],
  ["Tuyển người bán hàng đầu tiên?", "Tôi tự điều hành một công ty phần mềm, doanh thu định kỳ 600 triệu/tháng, tăng 5% mỗi tháng. Tôi tự gọi mọi cuộc bán hàng (khoảng 20 giờ/tuần) và đang kiệt sức. Nên tuyển một nhân viên kinh doanh toàn thời gian lương cứng 250 triệu/năm, thuê người chốt bán thời gian ăn hoa hồng, hay tự bán thêm 6 tháng? Tôi có 3,5 tỷ tiền mặt."],
  ["Sản phẩm thứ hai?", "Agency của tôi doanh thu 2 tỷ/tháng, làm tự động hoá AI cho phòng nha. Vài khách hỏi có sản phẩm lễ tân AI không. Nên làm lễ tân AI thành phần mềm riêng, chỉ bán kèm cho khách hiện tại, hay tập trung vào agency? Đội 6 người, khoảng 5 tỷ tiền mặt."],
  ["Nghỉ việc?", "Tôi đang làm công ty công nghệ, thu nhập 4,5 tỷ/năm. Việc làm thêm (bản tin trả phí) mang về 150 triệu/tháng, năm nay tăng 8% mỗi tháng. Tôi có sẵn tiền đủ sống 9 tháng. Nên nghỉ ngay, nghỉ sau 6 tháng, hay giữ cả hai và thuê người viết?"],
];


const SHAPES = ["base", "open", "mid", "blink"];
// A seat's cartoon frames live in /portraits/<key>-<shape>.webp (or .png, .jpg). A seat added with /newroaster
// may have only a base frame, or none: missing frames fall back to the base frame, then to a
// drawn bust in the seat's color whose mouth and eyes still move.
const portrait = (key, shape = "base") => {
  const have = state.byKey[key]?.portraits || {};
  return have[shape] || have.base || drawnBust(key, shape);
};
const bustCache = new Map();
function drawnBust(key, shape) {
  const id = `${key}-${shape}`;
  if (bustCache.has(id)) return bustCache.get(id);
  const s = state.byKey[key] || {};
  const c = /^#[0-9a-f]{6}$/i.test(s.color || "") ? s.color : "#37bdf8";
  const initials = esc((s.initials || s.short || key).slice(0, 3).toUpperCase());
  const eyes = shape === "blink"
    ? `<path d="M226 250h30M304 250h30" stroke="#1d2733" stroke-width="7" stroke-linecap="round"/>`
    : `<circle cx="241" cy="250" r="11" fill="#1d2733"/><circle cx="319" cy="250" r="11" fill="#1d2733"/><circle cx="245" cy="246" r="3.5" fill="#fff"/><circle cx="323" cy="246" r="3.5" fill="#fff"/>`;
  const mouth = shape === "open" ? `<ellipse cx="280" cy="318" rx="24" ry="17" fill="#5a2430"/>`
    : shape === "mid" ? `<ellipse cx="280" cy="316" rx="20" ry="8" fill="#5a2430"/>`
    : `<path d="M256 312q24 16 48 0" fill="none" stroke="#5a2430" stroke-width="7" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 560"><g transform="translate(-14 -64) scale(1.05)">
    <path d="M70 640c0-160 86-250 210-250s210 90 210 250z" fill="${c}"/>
    <path d="M232 384h96l-48 58z" fill="#e9eef3"/>
    <rect x="248" y="330" width="64" height="70" rx="22" fill="#d9b49a"/>
    <ellipse cx="280" cy="250" rx="112" ry="128" fill="#e8c4a8"/>
    <path d="M168 236c0-90 50-122 112-122s112 32 112 122c-20-46-60-64-112-64s-92 18-112 64z" fill="#3a4654"/>
    ${eyes}${mouth}
    <text x="280" y="540" text-anchor="middle" font-family="Be Vietnam Pro, Arial, sans-serif" font-weight="800" font-size="54" fill="rgba(255,255,255,.92)">${initials}</text>
  </g></svg>`;
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  bustCache.set(id, url);
  return url;
}
const ROUND_NAME = ["", "Mở đầu", "Tranh luận", "Bỏ phiếu"];

// Chữ tiếng Việt để hiển thị. Server, roster.json và Chủ toạ vẫn dùng nhãn tiếng Anh; đổi ở đây.
const SEAT_VI = {
  bezos: ["Chiến lược và ra quyết định", "Đây có phải ván cược đúng, và có lùi lại được không?"],
  graham: ["Sản phẩm và khởi nghiệp", "Khách có thật sự cần thứ này không, và nó có đang tăng trưởng không?"],
  hormozi: ["Gói dịch vụ, giá và bán hàng", "Khách có chịu trả tiền không, trả bao nhiêu, và chốt thế nào?"],
  garyvee: ["Marketing và sự chú ý", "Sự chú ý của khách đến từ đâu, và kênh đó có đang rẻ không?"],
  martell: ["Con người, tuyển dụng và thời gian của người chủ", "Ai làm việc này, và nó lấy bao nhiêu thời gian của người chủ?"],
  wickman: ["Vận hành và mở rộng", "Doanh nghiệp có tự chạy được việc này mà không cần người chủ gánh không?"],
  buffett: ["Tiền và vốn", "Việc này tác động thế nào đến tiền mặt, rủi ro và giá trị lâu dài?"],
  naval: ["Đòn bẩy và tài sản", "Việc này có tạo đòn bẩy và tài sản bạn sở hữu, hay chỉ là bán thời gian của bạn?"],
  sanchez: ["Mua và sở hữu doanh nghiệp nhỏ", "Nên tự xây, hay mua lại thứ đã chạy được?"],
  blakely: ["Sản phẩm tiêu dùng và thương hiệu từ con số 0", "Khách có thích nó đến mức tự bán hộ bạn, mà không cần vốn bên ngoài không?"],
  leila: ["Lãnh đạo và mở rộng đội ngũ", "Đội ngũ và năng lực lãnh đạo của bạn có gánh được việc này không, và ai phải thay đổi?"],
  musk: ["Nguyên lý gốc và tốc độ thực thi", "Ràng buộc thật ở đây là gì, và có thể cắt bớt bước để làm nhanh hơn không?"],
};
const pillarOf = (s) => SEAT_VI[s.key]?.[0] || s.pillar;
const questionOf = (s) => SEAT_VI[s.key]?.[1] || s.question;
const VERDICT_VI = { "GO": "LÀM", "GO WITH CONDITIONS": "LÀM, CÓ ĐIỀU KIỆN", "RESHAPE": "ĐIỀU CHỈNH", "WAIT": "CHỜ", "DON'T DO IT": "KHÔNG LÀM" };
const verdictVi = (l) => VERDICT_VI[String(l || "").toUpperCase()] || l;
const VOTE_VI = { endorse: "đồng ý", amend: "sửa đổi", dissent: "phản đối" };
const voteVi = (v) => VOTE_VI[v] || v;
const PHASE_VI = [
  [/^The Chair is reading your question$/, "Chủ toạ đang đọc câu hỏi"],
  [/^The Chair is finding the fault lines$/, "Chủ toạ đang tìm điểm vênh"],
  [/^The Chair is weighing the debate$/, "Chủ toạ đang cân nhắc cuộc tranh luận"],
  [/^The Chair is drafting a resolution$/, "Chủ toạ đang soạn đề xuất"],
  [/^The Chair is writing the verdict$/, "Chủ toạ đang viết kết luận"],
  [/^The Chair is giving his own view$/, "Chủ toạ đang nêu góc nhìn của mình"],
  [/^Round 1: opening positions$/, "Vòng 1: quan điểm mở đầu"],
  [/^Round 2: the debate$/, "Vòng 2: tranh luận"],
  [/^Round 3: the vote$/, "Vòng 3: bỏ phiếu"],
  [/^Quick mode: spread (\S+) and no ruin risk, so the vote round is skipped$/, "Chế độ nhanh: điểm chênh $1, không có rủi ro sập, nên bỏ vòng bỏ phiếu"],
  [/^Quick mode: the vote round is skipped$/, "Chế độ nhanh: bỏ vòng bỏ phiếu"],
];
const phaseVi = (l = "") => { for (const [re, vi] of PHASE_VI) if (re.test(l)) return l.replace(re, vi); return l; };
const MODE_VI = { full: "đầy đủ", quick: "nhanh" };
const STATUS_VI = { done: "xong", running: "đang chạy", error: "lỗi" };

const state = {
  seats: [], byKey: {}, board: [], table: [], session: null, options: [], weights: {}, active: [], round: 0,
  cards: { 1: {}, 2: {}, 3: {} }, replaying: false, verdict: null, links: [], geo: {}, setup: null, wait: null,
  chair: null, hoi: null,
};

// The Chair (the `musk` seat by default) does not debate: he sits in the middle, behind the table,
// asks the root-question rounds and leads the council. His bust is #seat-chair; "chair" is his key on the stage.
const CHAIR = "chair";
const THU_KY = "thuky";
const isChair = (k) => k === CHAIR || (!!k && k === state.chair);
const seatEl = (k) => (isChair(k) ? $("#seat-chair") : k ? $(`#seat-${k}`) : null);
const plateEl = (k) => (isChair(k) ? $("#plate-chair") : k ? $(`#plate-${k}`) : null);
const chairName = () => (state.byKey[state.chair] ? `${state.byKey[state.chair].name} · Chủ toạ` : "Chủ toạ");

// ------------------------------------------------------------- boot
async function boot() {
  const r = await refreshSeats();
  state.runner = r.runner;
  addEventListener("resize", layoutStage);
  document.fonts?.ready.then(layoutStage); // nameplate widths change once the fonts arrive
  if (r.runner === "api" && !r.hasKey) toast("Chưa có key trong .env (CLAUDE_CODE_OAUTH_TOKEN hoặc ANTHROPIC_API_KEY). Thêm vào rồi khởi động lại server.");
  renderSeats(state.board);
  renderSamples();
  bindUI();
  new ResizeObserver(() => { layoutStage(); drawLinks(); }).observe($("#stage"));
  // the table grows to hold the cards on it, so a card that grows, appears or goes re-lays the room
  const cards = new ResizeObserver(() => requestAnimationFrame(() => { layoutStage(); drawLinks(); }));
  for (const el of $("#center").children) cards.observe(el);
  startBlinking();
  reset();
  typeIn($("#composer h2"));
  typeIn($("#waiting h2"));
  const ss = await fetch("/api/sessions").then((x) => x.json());
  if (ss.running) attach(ss.running);
  else if (ss.live) attach(ss.live);
  refreshUsage();
  setInterval(watchForLive, 2500);
  setInterval(tickWait, 1000);
}

// The roster (every seat, plus the default board) comes from the skill's roster.json.
async function refreshSeats() {
  const r = await fetch("/api/seats").then((x) => x.json());
  state.seats = r.seats;
  state.byKey = Object.fromEntries(r.seats.map((s) => [s.key, s]));
  state.chair = state.byKey[r.chair] ? r.chair : null;
  state.thuKy = state.chair && r.thu_ky ? r.thu_ky : null; // stands behind the Chair; not a seat, never votes
  if (state.thuKy) state.byKey[THU_KY] = state.thuKy;
  state.board = (r.board?.default || []).filter((k) => state.byKey[k] && k !== state.chair);
  if (!state.board.length) state.board = r.seats.filter((s) => s.key !== state.chair).slice(0, 7).map((s) => s.key);
  bustCache.clear();
  return r;
}

// a council started in Claude Code shows up here on its own
const seenLive = new Set();
async function watchForLive() {
  const ss = await fetch("/api/sessions").then((x) => x.json()).catch(() => null);
  const id = ss?.live || ss?.running;
  if (!id || seenLive.has(id) || id === state.session) return;
  seenLive.add(id);
  attach(id);
}

// Arrival: a heading types in a character at a time, blur to sharp
function typeIn(el) {
  if (!el) return;
  const text = el.textContent;
  el.classList.add("typein");
  // characters sit inside a nowrap span per word, so lines only break between words
  let i = 0;
  el.innerHTML = text.split(" ").map((word) => `<span class="wd">${[...word].map((c) => `<span class="ch" style="animation-delay:${i++ * 22}ms">${esc(c)}</span>`).join("")}</span>`).join(" ");
  el.setAttribute("aria-label", text);
}

function renderSamples() {
  $("#samples").innerHTML = SAMPLES.map(([t], i) => `<button type="button" data-i="${i}">${esc(t)}</button>`).join("");
  $("#samples").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $("#prompt").value = SAMPLES[b.dataset.i][1];
    $("#prompt").focus();
  });
}

const MAX_TABLE = 9; // the most busts the table can seat and still read

/** Seat these keys at the table (roster order), never the Chair. Does nothing when they are already seated. */
function renderSeats(keys) {
  const order = state.seats.map((s) => s.key);
  const want = order.filter((k) => keys.includes(k) && k !== state.chair).slice(0, MAX_TABLE);
  if (want.join() === state.table.join() && $("#seats").children.length) return;
  state.table = want;
  const seats = want.map((k) => state.byKey[k]);
  const bust = (key) => `<div class="bust" data-shape="base">${SHAPES.map((sh) => `<img class="${sh}" src="${portrait(key, sh)}" alt="" draggable="false">`).join("")}</div>`;
  const ch = state.byKey[state.chair];
  $("#seats").innerHTML = (ch ? `
    <div class="seat chair" id="seat-chair" data-seat="${CHAIR}" aria-label="${esc(chairName())}">
      <div class="think" aria-hidden="true"><i></i><i></i><i></i></div>
      ${bust(ch.key)}
    </div>` : "") + (state.thuKy ? `
    <div class="seat thuky" id="seat-${THU_KY}" data-seat="${THU_KY}" aria-label="Thư ký">
      ${bust(THU_KY)}<span class="tk-label">Thư ký</span>
    </div>` : "") + seats.map((s, i) => `
    <div class="seat" id="seat-${s.key}" data-seat="${s.key}" style="--d:-${(i * 1.7) % 6}s" tabindex="0" role="button" aria-label="${esc(s.name)}, ${esc(pillarOf(s))}. Mở thẻ.">
      <div class="think" aria-hidden="true"><i></i><i></i><i></i></div>
      ${bust(s.key)}
    </div>`).join("");
  const meta = '<div class="meta"><span class="pips" title="Trọng số trong quyết định này"></span><span class="chip" hidden></span><span class="score" hidden></span></div>';
  $("#plates").innerHTML = (ch ? `
    <div class="nameplate chair" id="plate-chair" data-seat="${CHAIR}">
      <b>${esc(ch.name)} <span>· Chủ toạ</span></b>
      ${meta}
    </div>` : "") + seats.map((s) => `
    <div class="nameplate" id="plate-${s.key}" data-seat="${s.key}">
      <b><span class="nm-full">${esc(s.short === "Gary V" ? "Gary V" : s.name)}</span><span class="nm-short">${esc(s.short)}</span></b>
      <small>${esc(pillarOf(s))}</small>
      ${meta}
    </div>`).join("");
  layoutStage();
  startBlinking();
}

// A round table seen from a little above, so its rim is an ellipse (a circle once it has grown all
// the way). The Chair sits at the far side; the others take equal angles round the rest of the rim,
// so the gaps are even on the table itself. Seats on the far half sit behind the rim (the table hides
// their chests); seats on the near half sit in front of it, a little bigger, nameplate below them.
// On a computer the cards lie in the middle of the table and the table grows, up to a full circle,
// to hold them (past that they scroll). On a phone the scene sits on top and the cards flow below it.
function layoutStage() {
  const stage = $("#stage"), c = $("#center");
  const W = stage.clientWidth;
  if (!W) return;
  const narrow = matchMedia("(max-width: 820px)").matches;
  const keys = [...($("#seat-chair") ? [CHAIR] : []), ...state.table];
  const N = Math.max(1, keys.length);
  const rx = W * (narrow ? 0.38 : 0.37);
  const S = W * (narrow ? 0.18 : 0.125) * Math.min(1, 9 / Math.max(9, N)); // a seat at the side of the table
  const cw = Math.min(rx * 1.32, 660); // the cards' width on the table
  if (!narrow) c.style.width = `${Math.round(cw)}px`;
  const need = narrow ? 0 : c.scrollHeight; // the cards' full height, even while they scroll
  const plates = Object.fromEntries(keys.map((k) => { const p = plateEl(k); return [k, { w: p?.offsetWidth || 0, h: p?.offsetHeight || 0 }]; }));
  // everything relative to the table's centre for a given ry
  const scene = (ry) => {
    const seats = keys.map((key, i) => {
      const th = -Math.PI / 2 + (2 * Math.PI * i) / N, d = Math.sin(th), chair = key === CHAIR;
      const size = S * (chair ? 1.3 : 1 + 0.14 * d), x = rx * Math.cos(th), y = ry * d;
      const near = !chair && d > 0.05;
      const top = near ? y - size * 0.2 : y - size * (chair ? 0.84 : 0.78);
      const { w, h } = plates[key];
      const py = near ? top + size * 0.94 + h / 2 : y + (chair ? 34 : 8) + h / 2; // near: under the bust; far: on the rim in front of them
      return { key, d, size, x, y, near, top, plate: { x, y: py, w, h } };
    });
    // nameplates never cover each other: a plate that would overlap one already placed drops just below it
    const placed = [];
    for (const s of seats) {
      const me = s.plate;
      for (let i = 0, hit = true; hit && i < 20; i++) {
        const q = placed.find((q) => Math.abs(me.x - q.x) < (me.w + q.w) / 2 + 2 && Math.abs(me.y - q.y) < (me.h + q.h) / 2 + 2);
        if ((hit = !!q)) me.y = q.y + (me.h + q.h) / 2 + 3;
      }
      placed.push(me);
    }
    // the clear middle of the table: below the far seats' nameplates, above the near seats' heads
    // (a head is the middle ~60% of its bust; the top corners of the image are empty)
    const over = (x, half) => Math.abs(x) - half < cw / 2;
    const top = Math.max(-ry + 24, ...seats.filter((s) => !s.near && over(s.x, s.plate.w / 2)).map((s) => s.plate.y + s.plate.h / 2)) + 14;
    const bottom = Math.min(ry - 14, ...seats.filter((s) => s.near && over(s.x, s.size * 0.3)).map((s) => s.top + s.size * 0.06)) - 14;
    return { seats, top, bottom };
  };
  let ry = rx * (narrow ? 0.78 : 0.55), sc = scene(ry); // a phone's table holds no cards, so it can be seen from higher up
  for (let i = 0; !narrow && i < 4 && sc.bottom - sc.top < need && ry < rx; i++) sc = scene((ry = Math.min(rx, ry + (need - (sc.bottom - sc.top)) / 1.6 + 2)));
  const cx = W / 2;
  const cy = Math.round(-Math.min(...sc.seats.map((s) => s.top)) + (narrow ? 26 : 38)); // room for a thinking bubble over the Chair
  const H = Math.round(cy + Math.max(ry + 18, ...sc.seats.map((s) => s.plate.y + s.plate.h / 2)) + (narrow ? 10 : 56)); // and for the playbar
  stage.style.setProperty("--scene-h", `${H}px`);
  Object.assign($("#table").style, { left: `${cx - rx}px`, top: `${cy - ry}px`, width: `${rx * 2}px`, height: `${ry * 2}px` });
  state.geo = {};
  for (const s of sc.seats) {
    const el = seatEl(s.key), pl = plateEl(s.key), x = cx + s.x, top = cy + s.top;
    Object.assign(el.style, { left: `${x - s.size / 2}px`, top: `${top}px`, width: `${s.size}px`, height: `${s.size}px` });
    if (s.key !== CHAIR) el.style.zIndex = s.near ? 33 : 10 + Math.round((s.d + 1) * 4);
    el.classList.toggle("near", s.near);
    pl.classList.toggle("near", s.near);
    Object.assign(pl.style, { left: `${x}px`, top: `${cy + s.plate.y}px` });
    state.geo[s.key] = { x, head: top + s.size * 0.28, top: top + s.size * 0.1, size: s.size };
  }
  if (state.geo[CHAIR]) state.geo[state.chair] = state.geo[CHAIR];
  const ghe = sc.seats.find((s) => s.key === CHAIR), tk = $(`#seat-${THU_KY}`);
  if (ghe && tk) {
    const size = ghe.size * 0.78, x = cx + ghe.x + ghe.size * 0.6, top = cy + ghe.top - ghe.size * 0.1;
    Object.assign(tk.style, { left: `${x - size / 2}px`, top: `${top}px`, width: `${size}px`, height: `${size}px` });
    state.geo[THU_KY] = { x, head: top + size * 0.28, top: top + size * 0.1, size };
  }
  state.tableCentre = { x: cx, y: cy };
  if (narrow) {
    stage.style.minHeight = "";
    stage.style.paddingTop = `${H}px`; // the scene sits on top; the cards flow below it
    Object.assign(c.style, { width: "", maxHeight: "", overflowY: "" });
  } else {
    stage.style.minHeight = `${H}px`;
    stage.style.paddingTop = `${Math.round(cy + sc.top)}px`;
    Object.assign(c.style, { maxHeight: `${Math.round(sc.bottom - sc.top)}px`, overflowY: "auto" });
  }
  if (!stage.classList.contains("laid")) requestAnimationFrame(() => stage.classList.add("laid")); // from now on seats glide when the table grows
  if (state.speaking && state.geo[state.speaking]) moveSpot(state.speaking);
}

function moveSpot(key) {
  const g = state.geo[key]; const spot = $("#spot");
  if (!g) { spot.classList.remove("on"); return; }
  spot.style.left = `${g.x}px`;
  spot.style.top = `${g.head}px`;
  spot.style.width = spot.style.height = `${g.size * 1.9}px`;
  spot.classList.add("on");
}

function bindUI() {
  // a question goes to the Chair first: he answers a lookup, or asks back until the root problem is pinned down
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#prompt").value.trim();
    if (q.length < 5) return toast("Câu hỏi hơi ngắn. Viết rõ hơn một chút.");
    if (!state.hoi?.busy) askHoi(q);
  });
  $("#prompt").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("#composer").requestSubmit(); });
  $("#hoi").addEventListener("click", (e) => {
    const c = e.target.closest(".choice");
    if (c) { // pick one; pick it again to clear
      const on = c.getAttribute("aria-pressed") !== "true";
      $$(".choice", c.parentElement).forEach((b) => b.setAttribute("aria-pressed", "false"));
      c.setAttribute("aria-pressed", String(on));
      c.closest(".hoi-q")?.classList.remove("missing");
      return;
    }
    const b = e.target.closest("[data-act]");
    if (b && !b.disabled && !state.hoi?.busy) hoiAct(b.dataset.act, b);
  });
  $("#hoi").addEventListener("input", (e) => e.target.closest(".hoi-q")?.classList.remove("missing"));
  // the Chair's bust opens a card only when he spoke as a seat (councils from before he chaired)
  const openFrom = (e) => {
    const b = e.target.closest("[data-seat]"); if (!b || b.dataset.seat === THU_KY) return;
    const k = b.dataset.seat === CHAIR ? state.chair : b.dataset.seat;
    if (k && (b.dataset.seat !== CHAIR || [1, 2, 3].some((r) => state.cards[r][k]))) openCard(k);
  };
  $("#seats").addEventListener("click", openFrom);
  $("#plates").addEventListener("click", openFrom);
  $("#seats").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFrom(e); } });
  $("#feed").addEventListener("click", (e) => { const c = e.target.closest(".feed-card"); if (c) openCard(c.dataset.seat, Number(c.dataset.round)); });
  $("#waitHistory").addEventListener("click", openHistory);
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-pdf]")) savePdf(e.target.closest("[data-pdf]"));
    const ht = e.target.closest("[data-hop-tiep]");
    if (ht && !ht.disabled) hopTiep(ht);
  });
  $("#historyBtn").addEventListener("click", openHistory);
  $("#newBtn").addEventListener("click", reset);
  $("#verdictSheet").addEventListener("click", (e) => { if (e.target.id === "verdictSheet" || e.target.closest("[data-close]")) $("#verdictSheet").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#verdictSheet").hidden = true; });
  // Clicking the dimmed backdrop around a card, the guide, or past sessions closes it (Escape already does).
  // Both press and release must land outside the box, so a text selection dragged out of it never closes it.
  $$("dialog.card-dialog").forEach((d) => {
    const outside = (e) => {
      const r = d.getBoundingClientRect();
      return e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
    };
    let pressedOutside = false;
    d.addEventListener("pointerdown", (e) => { pressedOutside = outside(e); });
    d.addEventListener("click", (e) => { if (pressedOutside && outside(e)) d.close(); pressedOutside = false; });
  });
  $$(".speed button").forEach((b) => b.addEventListener("click", () => {
    player.speed = Number(b.dataset.speed);
    $$(".speed button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));
  $("#skipBtn").addEventListener("click", () => player.skip());
  $("#caption").addEventListener("click", () => { if (state.hoi && state.speaking === CHAIR) player.skip(); }); // hurry the Chair along
}

// ------------------------------------------------------------- the player
// Every event goes through one ordered queue. Seats speak one at a time, at a
// readable pace, even though the API answers them in parallel. Skip ahead drains
// whatever is queued instantly; new events after that animate again.
const player = {
  q: [], busy: false, epoch: 0, speed: 1, fast: false, timers: new Set(),
  push(ev) { this.q.push(ev); this.info(); this.pump(); },
  async pump() {
    if (this.busy) return;
    this.busy = true;
    const my = this.epoch;
    while (this.q.length && my === this.epoch) {
      const ev = this.q.shift();
      this.info();
      hideWait();
      try { await handle(ev); } catch (e) { console.error(e); }
    }
    if (my === this.epoch) { this.busy = false; this.fast = false; this.info(); }
  },
  sleep(ms) {
    if (this.fast || ms <= 0) return Promise.resolve();
    return new Promise((res) => { const t = setTimeout(() => { this.timers.delete(o); res(); }, ms / this.speed); const o = { t, res }; this.timers.add(o); });
  },
  flushTimers() { for (const o of this.timers) { clearTimeout(o.t); o.res(); } this.timers.clear(); },
  skip() { this.fast = true; this.flushTimers(); },
  reset() { this.epoch++; this.q.length = 0; this.fast = true; this.flushTimers(); this.busy = false; this.fast = false; this.info(); },
  info() {
    const waiting = this.q.filter((e) => e.type === "seat_done").length;
    $("#queueInfo").textContent = waiting ? `${waiting} lượt nói đang chờ` : "";
  },
};

// ------------------------------------------------------------- session wiring
function reset() {
  state.es?.close();
  player.reset();
  clearInterval(state.hoiTimer);
  state.hoi = null;
  $("#hoi").hidden = true;
  $("#hoi").innerHTML = "";
  $("#ask").disabled = false;
  Object.assign(state, { session: null, options: [], weights: {}, active: [], round: 0, cards: { 1: {}, 2: {}, 3: {} }, replaying: false, verdict: null, links: [], speaking: null, setup: null, wait: null, chairView: null, ended: false });
  hideWait();
  $("#stage").classList.remove("live");
  $("#topic").hidden = true;
  $("#composer").hidden = state.runner !== "api";
  $("#waiting").hidden = state.runner === "api";
  $("#caption").hidden = true;
  $("#cruxes").hidden = true;
  $("#plate").hidden = true;
  $("#playbar").hidden = true;
  $("#newBtn").hidden = true;
  $("#verdictSheet").hidden = true;
  $("#panelHead").textContent = "Ý chính";
  $("#feed").innerHTML = '<div class="empty">Mỗi ghế một dòng khi hội đồng lên tiếng. Bấm vào một ghế để đọc thẻ đầy đủ.</div>';
  $$(".vote").forEach((b) => b.remove());
  renderSeats(state.board);
  $$(".seat").forEach((el) => { el.classList.remove("absent", "speaking", "thinking", "addressed"); $(".bust", el).dataset.shape = "base"; });
  $$(".nameplate").forEach((el) => { el.classList.remove("absent", "speaking"); $(".chip", el).hidden = true; $(".score", el).hidden = true; $(".pips", el).innerHTML = ""; });
  $("#spot").classList.remove("on");
  $$(".stepper li").forEach((li) => li.classList.remove("active", "done"));
  setSpeaker(null);
  layoutStage();
  drawLinks();
}

function begin(id) {
  reset();
  state.session = id;
  $("#composer").hidden = true;
  $("#waiting").hidden = true;
  $("#newBtn").hidden = false;
  $("#playbar").hidden = false;
  $("#panelHead").textContent = "Ý chính";
  $("#feed").innerHTML = '<div class="empty">Mỗi ghế một dòng khi hội đồng lên tiếng. Bấm vào một ghế để đọc thẻ đầy đủ.</div>';
  $("#stage").classList.add("live");
  chairSays("Hội đồng đang vào chỗ", { dots: true });
}

function attach(id) {
  begin(id);
  const es = new EventSource(`/api/stream/${id}`);
  state.es = es;
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data);
    if (ev.type === "end") {
      es.close(); refreshUsage(); state.ended = true;
      $$("[data-hop-tiep]").forEach((b) => (b.disabled = false));
      // a council that ended without a view (viewer runs, a failed call) must not keep saying he is still on it
      if (!state.chairView && $("#vChair")) { $("#vChair").innerHTML = chairViewHtml({}); $("#seat-chair")?.classList.remove("thinking"); }
      return;
    }
    if (ev.type === "delta") return; // seats speak from their finished cards
    if (ev.type === "usage") return refreshUsage();
    if (ev.type === "seat_error") return toast(`${state.byKey[ev.seat]?.short || ev.seat} gặp lỗi: ${loiVi(ev.error)}`);
    player.push(ev);
  };
  es.onerror = () => { /* the browser retries; the server replays from the start */ };
}

// ------------------------------------------------------------- event handling
const STEP_OF = { setup: "setup", round1: "round1", cruxes: "cruxes", round2: "round2", draft: "round3", round3: "round3", skip3: "round3", verdict: "verdict", chair_view: "verdict" };
const ORDER = ["setup", "round1", "cruxes", "round2", "round3", "verdict"];

function setStep(step) {
  const idx = ORDER.indexOf(step);
  $$(".stepper li").forEach((li) => {
    const i = ORDER.indexOf(li.dataset.step);
    li.classList.toggle("done", i < idx);
    li.classList.toggle("active", i === idx);
  });
}

async function handle(ev) {
  switch (ev.type) {
    case "phase": {
      state.wait = { phase: ev.phase, at: ev.at || Date.now() };
      setStep(STEP_OF[ev.phase] || "setup");
      feedPhase(phaseVi(ev.label));
      // after the verdict the plate holds the centre: the Chair only thinks (bubble) until his view is in
      if (ev.phase === "chair_view") { $("#seat-chair")?.classList.add("thinking"); break; }
      const thinking = ["setup", "cruxes", "draft", "verdict"].includes(ev.phase);
      if (thinking || ev.phase === "skip3") {
        chairSays(phaseVi(ev.label).replace(/^Chủ toạ đang /, "").replace(/^./, (c) => c.toUpperCase()), { dots: thinking });
        await player.sleep(1400);
      }
      break;
    }
    case "setup": state.setup = ev; await onSetup(ev); await player.sleep(1800); break;
    case "round_start": onRoundStart(ev.round); break;
    case "seat_start": seatEl(ev.seat)?.classList.add("thinking"); break;
    case "seat_done": await onSeatDone(ev); break;
    case "round_done": state.wait = null; updateOptions(ev.scores); break;
    case "cruxes": await onCruxes(ev); break;
    case "draft": await onDraft(ev.draft); break;
    case "verdict": state.wait = null; onVerdict(ev); break;
    case "chair_view": await onChairView(ev); break;
    case "phieu": onPhieu(ev); break;
    case "error": { state.wait = null; const m = `Hội đồng đã dừng: ${loiVi(ev.error)}`; toast(m); chairSays(m); break; }
  }
}

async function onSetup(ev) {
  if (ev.seats.some((k) => !state.byKey[k])) await refreshSeats(); // a seat added since the page loaded
  // seat the default board plus anyone this council called in; past the table's limit, only this council
  const both = [...new Set([...state.board, ...ev.seats])];
  renderSeats(both.length <= MAX_TABLE ? both : ev.seats);
  state.options = ev.options;
  state.weights = ev.weights;
  state.active = ev.seats;
  $("#topic").hidden = false;
  $("#topicTitle").textContent = ev.title;
  typeIn($("#topicTitle"));
  $("#options").innerHTML = ev.options.map((o) => `
    <div class="opt" data-opt="${o.id}"><span class="id">${o.id}</span><span class="label">${esc(o.label)}</span><span class="val">-</span><span class="bar"><i></i></span></div>`).join("");
  for (const s of state.table.map((k) => state.byKey[k])) {
    const absent = !ev.seats.includes(s.key);
    $(`#seat-${s.key}`).classList.toggle("absent", absent);
    const pl = $(`#plate-${s.key}`);
    pl.classList.toggle("absent", absent);
    const w = ev.weights[s.key]?.weight || 1;
    pl.title = `Trọng số ${w}/3: ${ev.weights[s.key]?.reason || ""}`;
  }
  chairSays(ev.title, { tag: ev.mode === "quick" ? "Hội đồng nhanh" : "Hội đồng đầy đủ" });
}

function updateOptions(scores) {
  const best = Object.entries(scores).sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))[0]?.[0];
  for (const [id, v] of Object.entries(scores)) {
    const el = $(`.opt[data-opt="${id}"]`); if (!el) continue;
    $(".val", el).textContent = v.score ?? "-";
    $(".bar i", el).style.width = `${(v.score || 0) * 10}%`;
    el.classList.toggle("lead", id === best);
    el.title = v.math;
  }
}

function onRoundStart(round) {
  state.round = round;
  state.links = [];
  drawLinks();
  $("#cruxes").hidden = true;
  chairSays(`${["", "Vòng 1: quan điểm mở đầu", "Vòng 2: tranh luận", "Vòng 3: bỏ phiếu"][round]}`, { dots: true, tag: "Mời phát biểu" });
}

// ------------------------------------------------------------- talking
const clean = (t) => String(t || "").replace(/\s*\((?:S\d+|source[^)]*)[^)]*\)/gi, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

function firstSentences(t, max) {
  const parts = t.match(/[^.!?]+[.!?]+["”)]?\s*|[^.!?]+$/g) || [t];
  let out = "";
  for (const p of parts) { if (out && (out + p).length > max) break; out += p; }
  return shorten(out.trim(), max + 40);
}

/** The line a seat says out loud: the headline of its card, not the whole card. */
function lineFor(round, p, max = 170) {
  if (round === 1) return firstSentences(clean(p.call || p.stance), max);
  if (round === 2) {
    let t = clean(p.disagreeLine || p.stance);
    // "Graham. His argument..." reads as talking to him: "Graham, his argument..."
    t = t.replace(/^([A-Za-z][\w.' ]{0,24})[.:,]\s+(\S+)/, (m, name, next) => !seatKey(name) ? m : `${state.byKey[seatKey(name)].short}, ${/^I('|$)/.test(next) ? next : next[0].toLowerCase() + next.slice(1)}`);
    return firstSentences(t, max);
  }
  return firstSentences(clean(p.oneLine || p.amendment), max);
}

function shapesFor(word) {
  const out = [];
  for (const ch of word.toLowerCase()) {
    const s = "aei".includes(ch) ? "open" : "ouwy".includes(ch) ? "mid" : "mbpf".includes(ch) ? "base" : null;
    if (s && s !== out[out.length - 1]) out.push(s);
  }
  return out.length ? out : ["mid"];
}

function setShape(key, shape) { const b = seatEl(key)?.querySelector(".bust"); if (b) b.dataset.shape = shape; }

function setSpeaker(key, target) {
  key = isChair(key) ? CHAIR : key;
  target = isChair(target) ? CHAIR : target;
  state.speaking = key;
  stopMouth();
  $("#seat-chair")?.classList.remove("thinking");
  $$(".seat").forEach((el) => { el.classList.toggle("speaking", el.dataset.seat === key); el.classList.toggle("addressed", el.dataset.seat === target); });
  $$(".nameplate").forEach((el) => el.classList.toggle("speaking", el.dataset.seat === key));
  const el = seatEl(key);
  if (el) {
    el.classList.remove("thinking");
    // lean toward whoever they're answering
    const g = state.geo[key], tg = target && state.geo[target];
    el.style.transform = tg && g ? `translateX(${Math.sign(tg.x - g.x) * g.size * 0.04}px) rotate(${Math.sign(tg.x - g.x) * 2.5}deg) scale(1.05)` : "scale(1.05)";
    moveSpot(key);
  } else $("#spot").classList.remove("on");
  $$(".seat").forEach((s) => { if (s.dataset.seat !== key) s.style.transform = ""; });
}

function captionFor(who) {
  $("#cruxes").hidden = true;
  $("#plate").hidden = true;
  const c = $("#caption");
  c.hidden = false;
  c.style.animation = "none"; void c.offsetWidth; c.style.animation = "";
  const chair = !who || isChair(who);
  const key = chair ? state.chair : who;
  const s = state.byKey[key];
  $("#capAv").className = `cap-av${chair ? " chair" : ""}`;
  $("#capAv").innerHTML = `<img src="${s || !chair ? portrait(key) : "/brand/logo.png"}" alt="">`; // a seat gone from the roster gets a drawn bust
  $("#capWho").textContent = chair ? chairName() : s?.name || who;
}

/** The Chair's line in the caption. With dots he is thinking (bubble over his head);
 * without, his mouth moves along with the words. */
function chairSays(text, { dots = false, think = dots, tag = "" } = {}) {
  setSpeaker(think ? null : CHAIR);
  if (think && $("#seat-chair")) { $("#seat-chair").classList.add("thinking"); moveSpot(CHAIR); }
  captionFor(null);
  $("#capTag").textContent = tag;
  const p = $("#capText");
  p.className = "cap-text chair";
  p.innerHTML = esc(text) + (dots ? '<span class="dots"><i></i><i></i><i></i></span>' : "");
  $("#capSub").textContent = "";
  if (!think) mouthChair(text);
}

// The Chair's mouth keeps time with a line shown all at once (his captions, a lookup answer).
// A newer line, or anyone else starting to speak, stops it.
let mouthTok = 0;
function stopMouth() { mouthTok++; setShape(CHAIR, "base"); }
async function mouthChair(text) {
  const my = ++mouthTok;
  for (const w of String(text || "").split(/\s+/).filter(Boolean)) {
    if (my !== mouthTok || player.fast) break;
    const shapes = shapesFor(w.normalize("NFD").replace(/[^a-z]/gi, ""));
    const per = Math.max(170, w.length * 52) / (shapes.length + 1);
    for (const sh of shapes) { if (my !== mouthTok) return; setShape(CHAIR, sh); await player.sleep(per); }
    if (my !== mouthTok) return;
    setShape(CHAIR, "base");
    await player.sleep(per + (/[.!?]["”)]?$/.test(w) ? 340 : /[,;:]$/.test(w) ? 170 : 25));
  }
  if (my === mouthTok && state.speaking === CHAIR) setSpeaker(null); // done talking: back to idle
}

/** Resolves true when the line was said through; false when someone else (or "Câu hỏi mới") cut it off. */
async function speak(key, text, { tag = "", target = null, sub = "" } = {}) {
  setSpeaker(key, target);
  const my = mouthTok, live = () => my === mouthTok; // any later setSpeaker bumps mouthTok
  captionFor(key);
  $("#capTag").textContent = tag;
  $("#capSub").textContent = "";
  const p = $("#capText");
  p.className = "cap-text";
  const words = text.split(" ").filter(Boolean);
  p.innerHTML = words.map((w) => `<span class="w">${esc(w)}</span> `).join("");
  const spans = $$(".w", p);
  for (let i = 0; i < words.length; i++) {
    if (player.fast || !live()) break;
    const w = words[i];
    spans[i].classList.add("on");
    const shapes = shapesFor(w.normalize("NFD").replace(/[^a-z]/gi, ""));
    const dur = Math.max(170, w.length * 52);
    const per = dur / (shapes.length + 1);
    for (const sh of shapes) { if (!live()) break; setShape(key, sh); await player.sleep(per); }
    if (!live()) break;
    setShape(key, "base");
    await player.sleep(per + (/[.!?]["”)]?$/.test(w) ? 340 : /[,;:]$/.test(w) ? 170 : 25));
  }
  if (!live()) return false;
  spans.forEach((s) => s.classList.add("on"));
  setShape(key, "base");
  $("#capSub").innerHTML = sub;
  await player.sleep(1300);
  return true;
}

// idle blinking for everyone, so the room feels alive between lines
const blinking = new Set();
function startBlinking() {
  const blink = (key) => {
    const b = $(`#seat-${key} .bust`);
    if (b && b.dataset.shape === "base") {
      b.dataset.shape = "blink";
      setTimeout(() => { if (b.dataset.shape === "blink") b.dataset.shape = "base"; }, 130);
    }
    setTimeout(() => blink(key), 2400 + Math.random() * 4200);
  };
  [...(state.chair ? [CHAIR] : []), ...(state.thuKy ? [THU_KY] : []), ...state.table].filter((k) => !blinking.has(k)).forEach((k, i) => { blinking.add(k); setTimeout(() => blink(k), 600 + i * 530); });
}

async function onSeatDone(ev) {
  const { round, seat, text, parsed, quotes } = ev;
  state.cards[round][seat] = { text, parsed, quotes };
  const s = state.byKey[seat];
  const top = topOption(parsed.optionScores);
  const line = lineFor(round, parsed);
  let tag = ROUND_NAME[round], sub = "", target = null;
  if (round === 1) {
    tag = `${stanceWord(parsed.stance)}${top ? ` · chọn ${top.id} (${top.v}/10)` : ""}`;
  } else if (round === 2) {
    const tgt = parsed.disagreeWith ? state.byKey[parsed.disagreeWith] : null;
    if (tgt) {
      target = tgt.key;
      tag = `Phản bác ${tgt.short}`;
      state.links = state.links.filter((l) => l.from !== seat);
      state.links.push({ from: seat, to: tgt.key });
      drawLinks();
    }
    sub = /^yes/i.test(parsed.moved) ? "Đã đổi quan điểm" : "";
  } else {
    const v = parsed.vote || "endorse";
    tag = `Bỏ phiếu ${voteVi(v)}`;

  }
  feedCard(round, seat, parsed);
  await speak(seat, line || "Tôi ghi trong thẻ của mình.", { tag, target, sub });

  const pl = plateEl(seat);
  if (!pl) return setSpeaker(null); // a seat gone from the roster has no nameplate
  const chip = $(".chip", pl);
  chip.hidden = round === 3; // the vote stamp says it
  chip.className = "chip";
  if (round === 3) {
    const v = parsed.vote || "endorse";
    chip.textContent = voteVi(v);
    chip.classList.add(v);
    seatEl(seat)?.querySelector(".vote")?.remove();
    const stamp = document.createElement("div");
    stamp.className = `vote ${v}`;
    stamp.textContent = voteVi(v).toUpperCase();
    seatEl(seat)?.appendChild(stamp);
  } else chip.textContent = stanceWord(parsed.stance);
  if (top) { const sc = $(".score", pl); sc.hidden = false; sc.textContent = `${top.id} ${top.v}`; sc.title = `Điểm cao nhất: phương án ${top.id}`; }
  setSpeaker(null);
  void s;
}

function stanceWord(t = "") {
  const m = t.match(/strong yes|conditional yes|strong no|yes|no/i);
  if (!m) return "Đã nói";
  return { "strong yes": "Rất ủng hộ", "conditional yes": "Ủng hộ, nếu", "strong no": "Phản đối mạnh", yes: "Ủng hộ", no: "Phản đối" }[m[0].toLowerCase()];
}

function topOption(scores = {}) {
  const e = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return e ? { id: e[0], v: e[1] } : null;
}
const shorten = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t);
const face = (k) => `<img src="${portrait(k)}" alt="${esc(state.byKey[k]?.short || k)}" title="${esc(state.byKey[k]?.short || k)}">`;

async function onCruxes(ev) {
  setSpeaker(null);
  $("#caption").hidden = true;
  const c = $("#cruxes");
  c.hidden = false;
  c.innerHTML = `<div class="head">${ev.unanimous ? "Đồng thuận quá nhanh. Chủ toạ phản biện lại." : "Họ đang tranh cãi điều gì"}</div>` +
    ev.cruxes.map((x, i) => `<div class="crux" style="animation-delay:${i * 0.18}s"><b>${esc(x.question)}</b><div class="sides">${x.sides.map((sd) => `<span class="side"><span class="faces">${sd.seats.filter((k) => state.byKey[k]).map(face).join("")}</span>${esc(shorten(sd.position, 48))}</span>`).join("")}</div></div>`).join("");
  const f = document.createElement("div");
  f.className = "feed-note";
  f.innerHTML = `<b>Điểm tranh cãi:</b> ${ev.cruxes.map((x) => esc(x.question)).join(" ")}`;
  feedAppend(f);
  await player.sleep(3500 + 1800 * ev.cruxes.length);
}

async function onDraft(d) {
  chairSays(`Đề xuất: ${verdictVi(d.label)} cho phương án ${d.option}. ${firstSentences(clean(d.recommendation), 140)}`, { tag: "Đưa ra bỏ phiếu" });
  const f = document.createElement("div");
  f.className = "feed-note";
  f.innerHTML = `<b>Đưa ra bỏ phiếu:</b> ${esc(verdictVi(d.label))} cho phương án ${esc(d.option)}.`;
  feedAppend(f);
  await player.sleep(4200);
}

// ------------------------------------------------------------- rebuttal arcs
function drawLinks() {
  const svg = $("#links");
  const stage = $("#stage");
  const w = stage.clientWidth, h = stage.clientHeight;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const links = state.links || [];
  const col = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#37bdf8";
  const o = state.tableCentre || { x: w / 2, y: h / 2 };
  svg.innerHTML = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${col}"/></marker></defs>` +
    links.map(({ from, to }, i) => {
      const a = state.geo[from], b = state.geo[to];
      if (!a || !b) return "";
      const y1 = a.top - 6, y2 = b.top - 6;
      // bow away from the table's centre, round the rim; seats across the table from each other bow to one side
      const mx = (a.x + b.x) / 2, my = (y1 + y2) / 2, len = Math.hypot(b.x - a.x, y2 - y1);
      let dx = mx - o.x, dy = my - o.y;
      if (Math.hypot(dx, dy) < len * 0.25) { dx = y1 - y2; dy = b.x - a.x; }
      const k = Math.min(110, len * 0.3 + 20) / (Math.hypot(dx, dy) || 1);
      return `<path class="${i < links.length - 1 ? "old" : ""}" d="M${a.x},${y1} Q${mx + dx * k},${my + dy * k} ${b.x},${y2}" stroke="${col}" marker-end="url(#arrow)"/>`;
    }).join("");
}

// ------------------------------------------------------------- feed + cards
function feedAppend(node) {
  const feed = $("#feed");
  $(".empty", feed)?.remove();
  feed.appendChild(node);
  feed.scrollTop = feed.scrollHeight;
}
function feedPhase(label) {
  const d = document.createElement("div");
  d.className = "feed-phase";
  d.textContent = label.replace(/^Chủ toạ đang /, "Chủ toạ: ");
  feedAppend(d);
}
function feedCard(round, seat, parsed) {
  const s = state.byKey[seat];
  const d = document.createElement("div");
  d.className = "feed-card";
  d.dataset.seat = seat;
  d.dataset.round = round;
  const top = topOption(parsed.optionScores);
  const tgt = parsed.disagreeWith ? state.byKey[parsed.disagreeWith]?.short : "";
  const what = round === 1 ? `${stanceWord(parsed.stance)}${top ? `, chọn ${top.id}` : ""}` : round === 2 ? (tgt ? `phản bác ${tgt}` : "Tranh luận") : `Bỏ phiếu ${voteVi(parsed.vote || "endorse")}`;
  d.innerHTML = `<img class="av" src="${portrait(seat)}" alt=""><div><div class="h">${esc(s?.short || seat)}<span class="r">${esc(what)}</span></div><p>${esc(lineFor(round, parsed, 105))}</p></div>`;
  feedAppend(d);
}

function openCard(seat, round) {
  const s = state.byKey[seat];
  const rounds = [3, 2, 1].filter((r) => state.cards[r][seat]);
  const r = round || rounds[0];
  const c = state.cards[r]?.[seat];
  $("#cardBody").innerHTML = `
    <div class="card-head"><img src="${portrait(seat)}" alt=""><div><div class="label">${esc(pillarOf(s))}</div><h3>${esc(s.name)}</h3><p class="muted" style="margin:0">Câu hỏi phụ trách: ${esc(questionOf(s))}</p></div></div>
    ${rounds.length > 1 ? `<p style="margin:0 0 6px">${rounds.slice().reverse().map((x) => `<button class="ghost" data-r="${x}" style="margin-right:6px">${ROUND_NAME[x]}</button>`).join("")}</p>` : ""}
    ${c ? `<pre>${esc(c.text)}</pre>${c.quotes.length ? `<ul class="qcheck">${c.quotes.map((q) => `<li class="${q.verified ? "" : "bad"}">"${esc(shorten(q.quote, 110))}" (${q.source}) ${q.verified ? "có trong bộ não" : "không tìm thấy trong bộ não"}</li>`).join("")}</ul>` : ""}` : `<p class="muted">Ghế này chưa lên tiếng.</p>`}
    <p class="muted" style="font-size:12px">Cố vấn mô phỏng, dựng từ tác phẩm công khai của ${esc(s.name)}. Không phải người thật.</p>`;
  $$("#cardBody [data-r]").forEach((b) => b.addEventListener("click", () => openCard(seat, Number(b.dataset.r))));
  const dlg = $("#cardDialog");
  if (!dlg.open) dlg.showModal();
}

// ------------------------------------------------------------- verdict
// the Chair should write display names; map any raw seat key just in case
const seatKey = (x) => { const k = String(x).toLowerCase().replace(/\s+/g, ""); return state.byKey[k] ? k : state.seats.find((s) => s.short.toLowerCase() === String(x).toLowerCase() || s.name.toLowerCase() === String(x).toLowerCase())?.key; };
const seatName = (x) => state.byKey[seatKey(x)]?.short || x;

function labelClass(l) { return /DON'T/.test(l) ? "dont" : /RESHAPE/.test(l) ? "reshape" : /WAIT/.test(l) ? "wait" : "go"; }

function onVerdict(ev) {
  const v = ev.verdict;
  state.verdict = ev;
  setStep("verdict");
  setSpeaker(null);
  $("#caption").hidden = true;
  $("#cruxes").hidden = true;
  state.links = [];
  drawLinks();
  $("#stage").classList.remove("live");
  updateOptions(v.scores);
  const opt = (id) => state.options.find((o) => o.id === id)?.label || id;
  const seats = ev.seats;
  const mk = seatKey(v.minority.seat);
  const short = (t, n) => esc(shorten(clean(t || ""), n));
  const html = `
    <div class="v-top">
      <div><div class="label">Kết luận của hội đồng</div><span class="v-label ${labelClass(v.label)}">${esc(verdictVi(v.label))}</span></div>
      <div class="actions"><button class="pill" type="button" data-pdf>Tải PDF</button><button class="ghost" data-close>Quay lại bàn</button></div>
    </div>
    <p class="v-call">${esc(v.call)}</p>
    <div class="v-sec v-chair" id="vChair">${chairViewHtml(state.chairView || { pending: state.replaying ? state.expectChairView : !state.ended })}</div>
    ${soLieuHtml(v.kiem_so)}
    <div class="v-grid">
      <div class="v-sec"><h3>Điểm</h3><div class="v-opts">${state.options.map((o) => `
        <div class="opt ${o.id === v.recommended ? "lead" : ""}"><span class="id">${o.id}</span><span class="label">${esc(o.label)}</span><span class="val">${v.scores[o.id]?.score ?? "-"}</span><span class="bar"><i style="width:${(v.scores[o.id]?.score || 0) * 10}%"></i></span></div>`).join("")}</div>
        <p class="v-meta">Độ tin cậy ${v.confidence ?? "-"}/10${v.votes ? ` · ${v.votes.endorse || 0} đồng ý, ${v.votes.amend || 0} sửa đổi, ${v.votes.dissent || 0} phản đối` : ""}</p>
      </div>
      <div class="v-sec"><h3>Vì sao</h3><ul class="v-why">${v.why.slice(0, 3).map((w) => { const k = seatKey(w.seat); return `<li>${k ? `<img class="av" src="${portrait(k)}" alt="">` : ""}<span>${short(w.point, 150)}</span></li>`; }).join("")}</ul></div>
      <div class="v-sec"><h3>Cần lưu ý</h3><div class="minority"><div class="who">${mk ? `<img class="av" src="${portrait(mk)}" alt="">` : ""}${esc(seatName(v.minority.seat))}</div><q>${short(v.minority.quote, 170)}</q></div></div>
      <div class="v-sec"><h3>Bước tiếp theo</h3><ul class="v-steps">${v.next_steps.slice(0, 3).map((n) => `<li><b>${esc(n.when)}</b> ${short(n.action, 120)}</li>`).join("")}</ul>
        <p class="v-meta"><b>Dừng nếu:</b> ${short(v.kill_criteria, 140)}</p></div>
    </div>
    <details class="v-more"><summary>Chi tiết đầy đủ</summary>
      <div class="v-grid">
        <div class="v-sec"><h3>Chỗ họ tranh cãi</h3><ul>${v.fights.map((f) => `<li><b>${esc(f.crux)}</b> ${esc(f.story)}</li>`).join("")}</ul></div>
        <div class="v-sec"><h3>Điều kiện</h3><ol>${v.conditions.map((c) => `<li>${esc(c)}</li>`).join("")}</ol></div>
        <div class="v-sec v-wide"><h3>Bảng điểm</h3>
          <table class="scorecard"><thead><tr><th>Ghế</th><th>Trọng số</th>${state.options.map((o) => `<th>${o.id}</th>`).join("")}<th>Ý chính của họ</th></tr></thead><tbody>
          ${seats.map((x) => { const s = state.byKey[x.key]; return `<tr><td><span class="who"><img class="av" src="${portrait(x.key)}" alt="">${esc(s.short)}</span></td><td class="n">${x.weight}</td>${state.options.map((o) => `<td class="n">${x.optionScores?.[o.id] ?? "-"}</td>`).join("")}<td class="line">${short(x.oneLine, 150)}</td></tr>`; }).join("")}
          </tbody></table>
          <p class="muted" style="font-size:11.5px;margin-top:8px">Có trọng số theo mức quan trọng của từng mảng trong quyết định này. ${state.options.map((o) => `${o.id}: ${esc(v.scores[o.id]?.math || "")}`).join(" · ")}</p></div>
        <div class="v-sec"><h3>Cách thử rẻ nhất</h3><p>${esc(v.cheapest_test)}</p><h3>Xem lại vào</h3><p>${esc(v.revisit)}</p></div>
        <div class="v-sec"><h3>Phản đối mạnh nhất, đầy đủ</h3><p>${esc(v.minority.quote)}</p><p class="muted">Để ý kiến này đúng thì: ${esc(v.minority.would_have_to_be_true)}</p></div>
        ${v.amendments?.length ? `<div class="v-sec v-wide"><h3>Đề xuất sửa đổi</h3><ul>${v.amendments.map((a) => `<li><b>${esc(seatName(a.seat))}:</b> ${esc(a.amendment)} <span class="tag">${a.adopted ? "Được chấp nhận" : "Không chấp nhận"}: ${esc(a.reason)}</span></li>`).join("")}</ul></div>` : ""}
      </div>
    </details>
    ${hopTiepHtml()}
    <div class="v-foot"><span class="muted">Cố vấn mô phỏng, dựng từ tác phẩm công khai của từng người. Họ không phải người thật và không phát ngôn thay những người đó.</span><button class="ghost" data-close>Quay lại bàn</button></div>`;
  $("#verdictBody").innerHTML = html;
  const plate = $("#plate");
  plate.hidden = false;
  plate.innerHTML = `<div class="label">Kết luận của hội đồng</div><span class="v-label ${labelClass(v.label)}">${esc(verdictVi(v.label))}</span><p>${esc(firstSentences(clean(v.call), 150))}</p><div class="row"><button type="button" id="plateOpen">Đọc kết luận</button><button type="button" data-pdf>Tải PDF</button><button type="button" class="alt" id="plateReplay">Phát lại hội đồng này</button></div>${v.kiem_so?.chua_nguon?.length ? `<p class="plate-so">${v.kiem_so.chua_nguon.length} số trong kết luận chưa có nguồn. Bấm "Đọc kết luận" để xem.</p>` : ""}${hopTiepHtml()}`;
  $("#plateOpen").addEventListener("click", () => ($("#verdictSheet").hidden = false));
  $("#plateReplay").addEventListener("click", () => replay(state.session));
  $("#playbar").hidden = true;
  const f = document.createElement("div");
  f.className = "feed-note";
  f.innerHTML = `<b>Kết luận: ${esc(verdictVi(v.label))}.</b> ${esc(firstSentences(clean(v.call), 160))}`;
  feedAppend(f);
  setTimeout(() => { if (state.verdict === ev) $("#verdictSheet").hidden = false; }, 1600);
}

// ------------------------------------------------------------- the Chair's own view
// After the verdict the Chair says, from his own brain, whether he agrees. The verdict stays the
// council's; this is his comment on it, with the framework and source behind each reason.
const DONG_Y_VI = { "đồng ý": "Đồng ý", "đồng ý có điều kiện": "Đồng ý có điều kiện", "không đồng ý": "Không đồng ý" };
const dongYClass = (d) => (/không/.test(d) ? "dont" : /điều kiện/.test(d) ? "wait" : "go");
/** `ev` is a chair_view event, or { pending } before one arrives: pending while a live API council is
 * still on it (or a replay that has one coming), otherwise there is none (viewer runs, older councils). */
function chairViewHtml(ev) {
  const v = ev.view;
  if (!v) return `<h3>Góc nhìn Chủ toạ</h3><p class="muted">${ev.pending ? "Chủ toạ đang nêu góc nhìn của mình…" : `Chưa có góc nhìn Chủ toạ${ev.error ? `: ${esc(loiVi(ev.error, 140))}` : "."}`}</p>`;
  const bad = (ev.quotes || []).filter((q) => !q.verified).map((q) => q.quote);
  const flag = (t) => (bad.some((q) => String(t || "").includes(q)) ? ' <span class="tag bad">câu trích chưa khớp nguyên văn</span>' : "");
  return `<h3>Góc nhìn Chủ toạ</h3>
    <div class="chair-head">${state.chair ? `<img class="av" src="${portrait(state.chair)}" alt="">` : ""}<span class="v-label ${dongYClass(v.dong_y)}">${esc(DONG_Y_VI[v.dong_y] || v.dong_y)}</span></div>
    <p class="chair-say">${esc(v.nhan_dinh)}${flag(v.nhan_dinh)}</p>
    <ul class="chair-why">${(v.ly_do || []).map((l) => `<li><span>${esc(l.y)} <span class="muted">(${esc([l.khung, l.nguon].filter(Boolean).join(", "))})</span>${flag(l.y)}</span></li>`).join("")}</ul>
    ${v.bo_buoc ? `<p><b>Nên xoá:</b> ${esc(v.bo_buoc)}${flag(v.bo_buoc)}</p>` : ""}
    ${v.thu_nhanh ? `<p><b>Thử nhanh:</b> ${esc(v.thu_nhanh)}${flag(v.thu_nhanh)}</p>` : ""}
    ${ev.kiem_so?.chua_nguon?.length ? `<p class="so-canh"><b>Số chưa có nguồn:</b> ${ev.kiem_so.chua_nguon.map((x) => `<span class="so-co">${esc(x.so)}</span>`).join(", ")}</p>` : ""}`;
}

// ------------------------------------------------------------- numbers and their sources
// Every number in the verdict carries a label: đề bài, số liệu (with its source), tính (the arithmetic) or giả định.
// The server checks them (luat-so.mjs); a number with no source is flagged here, in the PDF and in the phiếu.
function soLieuHtml(ks) {
  if (!ks) return "";
  const canh = ks.chua_nguon?.length
    ? `<p class="so-canh"><b>${ks.chua_nguon.length} số chưa có nguồn:</b> ${ks.chua_nguon.map((x) => `<span class="so-co">${esc(x.so)}</span> <span class="muted">${esc(x.doan)}</span>`).join(" · ")}</p>`
    : `<p class="so-ok">Mọi con số trong kết luận đều có nguồn.</p>`;
  const dong = (ks.so_lieu || []).map((e) => `<li class="${esc(e.trang_thai)}"><b>${esc(e.so)}</b> ${esc(e.y)} <span class="tag">${esc(e.loai)}${e.nguon ? `: ${esc(e.nguon)}` : ""}</span>${e.trang_thai === "khong_thay" ? ' <span class="tag bad">không thấy trong số liệu</span>' : ""}</li>`).join("");
  return `<div class="v-sec v-so"><h3>Số dùng trong kết luận</h3>${canh}${dong ? `<ul class="so-list">${dong}</ul>` : ""}</div>`;
}

async function onChairView(ev) {
  state.chairView = ev;
  const v = ev.view;
  if ($("#vChair")) $("#vChair").innerHTML = chairViewHtml(ev);
  const line = v ? `${DONG_Y_VI[v.dong_y] || v.dong_y}. ${clean(v.nhan_dinh)}` : "Chưa có góc nhìn Chủ toạ.";
  $("#plate .plate-chair")?.remove();
  $("#plate .row")?.insertAdjacentHTML("beforebegin", `<p class="plate-chair"><b>Góc nhìn Chủ toạ:</b> ${esc(firstSentences(line, 200))}</p>`);
  const f = document.createElement("div");
  f.className = "feed-note";
  f.innerHTML = `<b>Góc nhìn Chủ toạ:</b> ${esc(firstSentences(line, 200))}`;
  feedAppend(f);
  // he says it out loud at the table, mouth moving, while the sheet holds the full text; then the plate comes back
  if (v && !player.fast) await speak(CHAIR, clean(v.nhan_dinh), { tag: "Góc nhìn Chủ toạ" });
  if (state.chairView !== ev) return;
  $("#seat-chair")?.classList.remove("thinking");
  if (state.speaking === CHAIR) setSpeaker(null);
  $("#caption").hidden = true;
  $("#plate").hidden = false;
}

// ------------------------------------------------------------- họp tiếp
// Under the verdict the asker adds what was missing and the council sits again on the same problem,
// in the same mode, writing into the same phiếu. Locked until this council's stream has ended.
function hopTiepHtml() {
  if (state.runner !== "api" || !state.session) return "";
  const off = !(state.ended || state.replaying);
  return `<div class="hop-tiep"><label>Bổ sung để làm rõ<textarea maxlength="2000" rows="3" placeholder="Số liệu mới, điều hội đồng chưa biết, điều bạn muốn xét lại…"></textarea></label><div class="hop-row"><span class="muted">5 đến 2.000 ký tự. Họp lại cùng chế độ; nếu đã có phiếu thì ghi tiếp vào phiếu đó.</span><button type="button" class="pill" data-hop-tiep${off ? " disabled" : ""}>Họp tiếp</button></div></div>`;
}

const TIEP_ERR = { 403: "Phòng đang ở chế độ xem nên chưa họp tiếp được (cần COUNCIL_RUNNER=api trong .env)." };
async function hopTiep(btn) {
  const ta = btn.closest(".hop-tiep")?.querySelector("textarea");
  const boSung = String(ta?.value || "").trim();
  if (boSung.length < 5) { toast("Bạn viết phần bổ sung ít nhất 5 ký tự."); ta?.focus(); return; }
  const id = state.session;
  const all = $$("[data-hop-tiep]");
  all.forEach((b) => (b.disabled = true));
  btn.textContent = "Đang triệu tập…";
  try {
    const j = await postJson(`/api/council/${encodeURIComponent(id)}/tiep`, { bo_sung: boSung });
    attach(j.id);
  } catch (e) {
    toast(TIEP_ERR[e.status] || (e.status ? e.message : `Chưa họp tiếp được: ${loiVi(e.message)}`)); // 400/404/409 carry the server's Vietnamese reason
    all.forEach((b) => { b.disabled = false; b.textContent = "Họp tiếp"; });
  }
}

/** The phiếu (phieu/… or PHIEU_DIR) was written, or could not be: say so on the table, in the feed and in a toast. */
function onPhieu(ev) {
  const ok = !ev.error;
  let what = ok ? ev.path : loiVi(ev.error);
  const head = ev.cap_nhat ? (ok ? "Đã cập nhật phiếu:" : "Chưa cập nhật được phiếu:") : ok ? "Đã lưu phiếu:" : "Chưa lưu được phiếu:";
  if (ok && ev.so_doi === false) what += " (sổ phiếu không đổi: không thấy dòng trỏ tới phiếu này)";
  toast(`${head} ${what}`);
  $("#plate").insertAdjacentHTML("beforeend", `<p class="plate-phieu${ok ? "" : " bad"}">${head} ${ok ? `<code>${esc(what)}</code>` : esc(what)}</p>`);
  const f = document.createElement("div");
  f.className = `feed-note${ok ? "" : " bad"}`;
  f.innerHTML = `<b>${head}</b> ${esc(what)}`;
  feedAppend(f);
}

// ------------------------------------------------------------- root-question rounds (hỏi gốc)
// A question goes to the Chair first. A lookup comes back answered, with sources. A decision opens
// up to five rounds where he asks back until the root problem is agreed, then he drafts the brief
// the council debates. Only the Chair talks here; the advisers idle and blink.
const MAX_LUOT = 5;

async function postJson(url, body) {
  let r;
  try { r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Error("Không kết nối được máy chủ. Kiểm tra server rồi thử lại."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Máy chủ báo lỗi ${r.status}.`), { status: r.status, code: j.code });
  return j;
}

/** The Chair thinks while a request is out: bubble over his head, a line in the caption, a clock. */
function hoiWait(text, { tag = "", sub = "" } = {}) {
  state.hoi.busy = true;
  $("#ask").disabled = true;
  $("#toast").hidden = true; // a new attempt supersedes the last error
  $("#composer").hidden = true;
  $("#hoi").hidden = true; // the card stays as it was, so a failed request can be retried from it
  chairSays(text, { think: true, tag });
  const t0 = Date.now();
  const tick = () => { $("#capSub").textContent = clock(Date.now() - t0) + (sub ? ` · ${sub}` : ""); };
  clearInterval(state.hoiTimer);
  tick();
  state.hoiTimer = setInterval(tick, 1000);
}

function hoiIdle() {
  clearInterval(state.hoiTimer);
  if (state.hoi) state.hoi.busy = false;
  $("#ask").disabled = false;
  setSpeaker(null);
  $("#caption").hidden = true;
}

function hoiFail(e, h) {
  if (state.hoi !== h) return; // the question was dropped meanwhile
  hoiIdle();
  if (h.started) $("#hoi").hidden = false;
  else { state.hoi = null; $("#composer").hidden = false; $("#newBtn").hidden = true; $$(".stepper li").forEach((li) => li.classList.remove("active", "done")); }
  toast(`Chủ toạ chưa trả lời được: ${loiVi(e.message)}`);
}

function showHoi(html) {
  hoiIdle();
  const el = $("#hoi");
  el.innerHTML = html;
  el.hidden = false;
  el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  state.hoi.started = true;
}

/** The secretary speaks one line: her mouth moves, the caption names her. Resolves false if cut off. */
async function thuKyNoi(text, tag) {
  $("#caption").hidden = false;
  $("#caption").scrollIntoView({ block: "nearest", behavior: "smooth" });
  let done = false;
  try { done = await speak(THU_KY, text, { tag }); } finally { player.fast = false; }
  if (done) setSpeaker(null);
  return done;
}

/** After the Chair has pinned down the root problem, the secretary reads out the numbers the council
 * will work from: each fact (its line lights up on the card), what is missing, and any warning. */
async function thuKyTrinh(d, h) {
  if (!state.thuKy) return;
  const nums = d.so_lieu || [];
  const items = $$(".db-nums li");
  const con = () => state.hoi === h;
  if (!(await thuKyNoi(nums.length ? `Thưa hội đồng, tôi trình ${nums.length} số liệu từ thư mục tài liệu của người hỏi.` : "Thưa hội đồng, chưa có số liệu nào từ thư mục tài liệu cho câu hỏi này.", "Thư ký trình số liệu")) || !con()) return;
  for (let i = 0; i < nums.length; i++) {
    items.forEach((li, j) => li.classList.toggle("on", j === i));
    items[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (!(await thuKyNoi(nums[i].noi_dung, `Số liệu ${i + 1}/${nums.length}`)) || !con()) { items.forEach((li) => li.classList.remove("on")); return; }
  }
  items.forEach((li) => li.classList.remove("on"));
  if ((d.chua_biet || []).length && con()) await thuKyNoi(`Chưa có số: ${d.chua_biet.join("; ")}.`, "Thư ký báo thiếu");
  if (d.canh_bao && con()) await thuKyNoi(String(d.canh_bao).split(" · ")[0], "Thư ký báo lỗi nguồn");
}

/** The Chair says a line out loud (mouth and words in step); a click on the caption hurries him. */
async function chairSpeaks(text, tag) {
  $("#caption").hidden = false;
  let done = false;
  try { done = await speak(CHAIR, text, { tag }); } finally { player.fast = false; }
  if (done) setSpeaker(null); // cut off: whoever cut in owns the stage now (e.g. his next thinking bubble)
}

async function askHoi(cauHoi) {
  const h = (state.hoi = { cauHoi, id: null, busy: false, started: false, luot: null, deXuat: "", deBai: null });
  $("#newBtn").hidden = false;
  setStep("setup");
  hoiWait("Chủ toạ đang nghĩ…", { tag: "Câu hỏi" });
  try {
    const j = await postJson("/api/hoi", { cau_hoi: cauHoi });
    if (state.hoi !== h) return;
    h.id = j.id;
    if (j.loai === "tra_cuu") return showTraCuu(j);
    await showLuot(j.luot);
  } catch (e) { hoiFail(e, h); }
}

function showTraCuu(j) {
  const src = j.nguon || [];
  showHoi(`
    <div class="hoi-head"><span class="label">Tra cứu</span></div>
    <p class="hoi-asked">${esc(state.hoi.cauHoi)}</p>
    <p class="hoi-answer">${esc(j.tra_loi || "Chưa tìm thấy câu trả lời trong tài liệu.")}</p>
    ${src.length ? `<h4>Nguồn</h4><ul class="hoi-src">${src.map((x) => `<li>${x.y || x.so ? `<span>${esc(x.y)}${x.so ? `: <b>${esc(x.so)}</b>` : ""}</span>` : ""}<code>${esc(x.nguon)}${x.ngay ? ` · ${esc(x.ngay)}` : ""}</code></li>`).join("")}</ul>` : ""}
    <div class="hoi-actions"><button type="button" class="convene" data-act="hoi-khac">Hỏi câu khác</button></div>`);
  setSpeaker(CHAIR);
  mouthChair(j.tra_loi); // he reads the answer out
}

async function showLuot(luot) {
  const h = state.hoi;
  h.luot = luot;
  hoiIdle();
  const first = luot.cau_hoi[0]?.hoi;
  if (luot.nhan_xet_so && state.thuKy) await thuKyNoi(luot.nhan_xet_so, "Thư ký · số liệu");
  if (state.hoi !== h || h.luot !== luot) return;
  if (first) await chairSpeaks(first, `Lượt ${luot.so}/${MAX_LUOT}`);
  if (state.hoi !== h || h.luot !== luot) return; // dropped, or moved on, while he was talking
  showHoi(`
    <div class="hoi-head"><span class="label">Chủ toạ hỏi</span><span class="hoi-step">Lượt ${luot.so}/${MAX_LUOT}</span></div>
    ${luot.nhan_xet_so ? `<p class="hoi-note">${state.thuKy ? "<b>Thư ký:</b> " : ""}${esc(luot.nhan_xet_so)}</p>` : ""}
    <ol class="hoi-qs">${luot.cau_hoi.map((q, i) => `
      <li class="hoi-q" data-q="${i}">
        <p class="hoi-ask" id="hq-${i}">${esc(q.hoi)}</p>
        <div class="hoi-opts" role="group" aria-labelledby="hq-${i}">
          ${(q.lua_chon || []).map((c, j) => `<button type="button" class="choice" data-c="${j}" aria-pressed="false">${esc(c)}</button>`).join("")}
          <input class="hoi-other" type="text" maxlength="1000" placeholder="Khác…" aria-label="Câu trả lời khác cho câu ${i + 1}">
        </div>
      </li>`).join("")}
    </ol>
    <div class="hoi-actions">
      <button type="button" class="convene" data-act="gui">Gửi trả lời</button>
      <button type="button" class="ghost" data-act="chay">Chạy hội đồng luôn</button>
    </div>`);
}

async function showDeXuat(text, het) {
  const h = state.hoi;
  h.deXuat = text;
  hoiIdle();
  await chairSpeaks(text, "Vấn đề gốc");
  if (state.hoi !== h || h.deXuat !== text || h.deBai) return;
  showHoi(`
    <div class="hoi-head"><span class="label">Chủ toạ đề xuất vấn đề gốc</span></div>
    <blockquote class="hoi-root">${esc(text)}</blockquote>
    ${het ? `<p class="hoi-note">Hết 5 lượt — chốt câu này hay chạy hội đồng luôn?</p>` : ""}
    <div class="hoi-edit" hidden><textarea rows="3" maxlength="2000" aria-label="Sửa câu vấn đề gốc">${esc(text)}</textarea></div>
    <div class="hoi-actions" data-view="xem">
      <button type="button" class="convene" data-act="dong-y">Đồng ý</button>
      <button type="button" class="ghost" data-act="sua">Sửa</button>
      ${het ? '<button type="button" class="ghost" data-act="chay">Chạy hội đồng luôn</button>' : ""}
    </div>
    <div class="hoi-actions" data-view="sua" hidden>
      <button type="button" class="convene" data-act="luu">Lưu</button>
      <button type="button" class="ghost" data-act="huy-sua">Huỷ</button>
    </div>`);
}

function showDeBai(d) {
  const nums = d.so_lieu || [], opts = d.phuong_an || [];
  const [canh, ...chiTiet] = String(d.canh_bao || "").split(" · "); // the raw reason after "·" is for diagnosis
  const docHong = canh.startsWith("Chưa đọc được tài liệu"); // the documents folder (TAI_LIEU_DIR) is set but could not be read
  showHoi(`
    <div class="hoi-head"><span class="label">Đề bài cho hội đồng</span></div>
    <h3 class="db-title">${esc(d.title)}</h3>
    ${canh ? `<p class="db-warn" role="alert"><b>${esc(canh)}</b> ${docHong ? "Hội đồng vẫn họp được, nhưng sẽ không có số liệu từ tài liệu." : ""}${chiTiet.length ? `<small>Chi tiết: ${esc(chiTiet.join(" · "))}</small>` : ""}</p>` : ""}
    <dl class="db-facts">
      <dt>Vấn đề gốc</dt><dd>${esc(d.van_de_goc)}${d.bo_qua_vong_hoi ? ' <span class="tag">bỏ vòng hỏi</span>' : ""}</dd>
      <dt>Nếu phải quyết hôm nay</dt><dd>${esc(d.tra_loi_ban_dau)}</dd>
    </dl>
    <h4>Số liệu thư ký trình</h4>
    ${nums.length ? `<ul class="db-nums">${nums.map((x) => `<li>${esc(x.noi_dung)} <span class="src">${esc(x.nguon)}${x.ngay ? ` · ${esc(x.ngay)}` : ""}</span></li>`).join("")}</ul>` : `<p class="db-none">${docHong ? "Chưa có số liệu vì chưa đọc được tài liệu." : "Chưa có số liệu đã kiểm trong tài liệu."}</p>`}
    ${(d.chua_biet || []).length ? `<p class="db-none"><b>Chưa có số:</b> ${d.chua_biet.map(esc).join("; ")}</p>` : ""}
    <p class="db-rule">Hội đồng chỉ được dùng số trên đây hoặc phép tính từ chúng; số không có nguồn sẽ bị gắn cờ.</p>
    <h4>Phương án</h4>
    <ol class="db-opts">${opts.map((o) => `<li><span class="id">${esc(o.id)}</span><span>${esc(o.label)}</span></li>`).join("")}</ol>
    <div class="composer-row">
      <div class="mode" role="radiogroup" aria-label="Quy mô hội đồng">
        <label><input type="radio" name="mode" value="full" checked><span>Đầy đủ <small>7 ghế, 3 vòng</small></span></label>
        <label><input type="radio" name="mode" value="quick"><span>Nhanh <small>4 ghế, 2 vòng</small></span></label>
      </div>
      <button type="button" class="convene" data-act="trieu-tap">Triệu tập hội đồng</button>
    </div>`);
}

async function hoiAct(act, btn) {
  const h = state.hoi;
  if (act === "hoi-khac") { reset(); $("#prompt").value = ""; $("#prompt").focus(); return; }
  if (!h) return;
  const card = $("#hoi");
  const view = (v) => $$(".hoi-actions[data-view]", card).forEach((a) => (a.hidden = a.dataset.view !== v));
  if (act === "sua") { $(".hoi-edit", card).hidden = false; view("sua"); $(".hoi-edit textarea", card).focus(); return; }
  if (act === "huy-sua") { $(".hoi-edit", card).hidden = true; $(".hoi-edit textarea", card).value = h.deXuat; view("xem"); return; }
  if (act === "dong-y") return hoiChot(h.deXuat);
  if (act === "chay") return hoiChot(null, true);
  if (act === "luu") {
    const v = $(".hoi-edit textarea", card).value.trim();
    if (!v) return toast("Câu vấn đề gốc đang trống.");
    return hoiChot(v);
  }
  if (act === "trieu-tap") return convene(btn);
  if (act !== "gui") return;
  const qs = h.luot.cau_hoi;
  const items = $$(".hoi-q", card);
  const tra_loi = items.map((li) => {
    const q = qs[li.dataset.q], on = $('.choice[aria-pressed="true"]', li);
    const chon = on ? q.lua_chon[on.dataset.c] : "", tu_go = $(".hoi-other", li).value.trim();
    return { id: q.id, ...(chon && { chon }), ...(tu_go && { tu_go }) };
  });
  const miss = items.filter((li, i) => !tra_loi[i].chon && !tra_loi[i].tu_go);
  miss.forEach((li) => li.classList.add("missing"));
  if (miss.length) { $(".hoi-other", miss[0]).focus(); return toast(miss.length === 1 ? "Còn một câu chưa trả lời: chọn một ý hoặc gõ vào ô Khác…" : `Còn ${miss.length} câu chưa trả lời: chọn một ý hoặc gõ vào ô Khác…`); }
  hoiWait("Chủ toạ đang nghĩ…", { tag: `Lượt ${h.luot.so}/${MAX_LUOT}` });
  try {
    const j = await postJson(`/api/hoi/${encodeURIComponent(h.id)}/tra-loi`, { tra_loi });
    if (state.hoi !== h) return;
    if (j.luot) await showLuot(j.luot);
    else await showDeXuat(j.de_xuat_van_de_goc, j.het_luot);
  } catch (e) { hoiFail(e, h); }
}

/** Agree the root problem and have the Chair draft the brief. boQua: skip the rounds, the brief takes the question as asked. */
async function hoiChot(vanDeGoc, boQua = false) {
  const h = state.hoi;
  hoiWait("Đang đọc wiki và soạn đề bài…", { tag: "Đề bài", sub: "thường mất vài phút" });
  try {
    const j = await postJson(`/api/hoi/${encodeURIComponent(h.id)}/chot`, boQua ? { van_de_goc: null, bo_qua: true } : { van_de_goc: vanDeGoc });
    if (state.hoi !== h) return;
    h.deBai = j.de_bai;
    showDeBai(j.de_bai);
    thuKyTrinh(j.de_bai, h);
  } catch (e) { hoiFail(e, h); }
}

const COUNCIL_ERR = {
  400: "Đề bài quá ngắn để triệu tập.",
  403: "Phòng đang ở chế độ xem nên chưa triệu tập được từ trang này (cần COUNCIL_RUNNER=api trong .env).",
  409: "Đang có một hội đồng họp. Chờ kết luận rồi triệu tập tiếp.",
};
async function convene(btn) {
  const h = state.hoi;
  const mode = $('#hoi input[name="mode"]:checked')?.value === "quick" ? "quick" : "full";
  h.busy = true;
  btn.disabled = true;
  btn.textContent = "Đang triệu tập…";
  try {
    const j = await postJson("/api/council", { prompt: h.deBai.prompt, mode, hoi_id: h.id });
    if (state.hoi === h) attach(j.id);
  } catch (e) {
    toast(e.code === "hoi_het_han" ? e.message : COUNCIL_ERR[e.status] || `Chưa triệu tập được hội đồng: ${loiVi(e.message)}`);
  } finally {
    h.busy = false;
    btn.disabled = false;
    btn.textContent = "Triệu tập hội đồng";
  }
}

// ------------------------------------------------------------- history + replay
async function openHistory() {
  const { sessions } = await fetch("/api/sessions").then((x) => x.json());
  $("#historyList").innerHTML = sessions.length
    ? sessions.map((s) => `<li><button data-id="${esc(s.id)}"><b>${esc(s.title)}</b><small>${esc(s.id.slice(0, 10))} · ${esc(MODE_VI[s.mode] || s.mode)} · ${esc(STATUS_VI[s.status] || s.status)}</small></button>${s.status === "done" ? `<button class="pdf" type="button" data-pdf="${esc(s.id)}" title="Tải kết luận dạng PDF">PDF</button>` : ""}</li>`).join("")
    : '<li class="muted">Chưa có phiên nào. Triệu tập hội đồng một lần là phiên hiện ở đây.</li>';
  $$("#historyList button[data-id]").forEach((b) => b.addEventListener("click", () => { $("#historyDialog").close(); replay(b.dataset.id); }));
  $("#historyDialog").showModal();
}

async function replay(id) {
  const j = await fetch(`/api/sessions/${encodeURIComponent(id)}`).then((x) => x.json());
  begin(id);
  state.replaying = true;
  state.expectChairView = j.events.some((e) => e.type === "chair_view");
  for (const ev of j.events) {
    if (["delta", "usage", "seat_error", "end", "phieu"].includes(ev.type)) continue; // the phiếu note belongs to the live run
    player.push(ev);
  }
}

// ------------------------------------------------------------- waiting on Claude Code
// A live council goes quiet for minutes while the seats write in parallel. Instead of a
// frozen table, say what is happening, how long it has been, and what each seat is weighing.
const SAME_TIME = "Các cố vấn viết cùng lúc. Lời của họ phát ở đây ngay khi cả vòng xong.";
function waitCopy(phase) {
  const n = state.setup?.mode === "quick" ? 2 : 3;
  return {
    setup: ["Dọn bàn", "Chủ toạ đang xếp chỗ cho hội đồng.", ""],
    round1: ["Vòng 1/" + n, "Các cố vấn đang viết quan điểm mở đầu.", SAME_TIME],
    round2: ["Vòng 2/" + n, "Các cố vấn đang đọc ý kiến của nhau và phản bác.", SAME_TIME],
    round3: ["Vòng 3/" + n, "Các cố vấn đang bỏ phiếu cho đề xuất của Chủ toạ.", SAME_TIME],
    cruxes: ["Giữa hai vòng", "Chủ toạ đang đọc các ý kiến mở đầu và tìm chỗ bất đồng.", "Điểm tranh cãi sẽ hiện ở đây, rồi vòng tranh luận bắt đầu."],
    draft: ["Giữa hai vòng", "Chủ toạ đang biến cuộc tranh luận thành một đề xuất để bỏ phiếu.", "Tiếp theo, mọi cố vấn bỏ phiếu cho đề xuất đó."],
    skip3: ["Bước cuối", "Chủ toạ đang chấm điểm và viết kết luận.", "Khi xong, bạn có thể tải về dạng PDF."],
    verdict: ["Bước cuối", "Chủ toạ đang chấm điểm và viết kết luận.", "Khi xong, bạn có thể tải về dạng PDF."],
  }[phase] || ["Đang làm", "Hội đồng đang làm việc.", ""];
}
const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

function hideWait() {
  const w = $("#waitcard");
  if (w.hidden) return;
  w.hidden = true;
  $$(".seat.musing").forEach((e) => e.classList.remove("musing"));
  if (state.capWasShown) $("#caption").hidden = false;
  if (state.playbarWasShown) $("#playbar").hidden = false;
}

function tickWait() {
  const w = state.wait;
  const idle = !player.busy && !player.q.length;
  if (!w || !idle || state.replaying || !state.session || state.verdict) return hideWait();
  const card = $("#waitcard");
  if (card.hidden) {
    state.capWasShown = !$("#caption").hidden;
    $("#caption").hidden = true;
    $("#cruxes").hidden = true;
    // speed controls do nothing while the room waits, and they would cover the card
    state.playbarWasShown = !$("#playbar").hidden;
    $("#playbar").hidden = true;
    card.hidden = false;
    state.museAt = 0;
  }
  const [step, head, sub] = waitCopy(w.phase);
  const elapsed = Date.now() - w.at;
  $("#wcStep").textContent = step;
  $("#wcTime").textContent = clock(elapsed);
  $("#wcHead").textContent = head;
  $("#wcSub").textContent = sub;
  $("#wcNudge").hidden = elapsed < 4 * 60 * 1000;
  const round = Number((w.phase.match(/^round(\d)$/) || [])[1]) || 0;
  const bar = $("#wcBar").parentElement;
  const muse = $("#wcMuse");
  if (round) {
    const seats = state.active.length ? state.active : state.table;
    const done = seats.filter((k) => state.cards[round][k]).length;
    bar.classList.toggle("indeterminate", done === 0);
    $("#wcBar").style.width = done ? Math.round((done / seats.length) * 100) + "%" : "";
    // every few seconds, show what one of the still-thinking seats is weighing
    const pending = seats.filter((k) => !state.cards[round][k]);
    if (pending.length && Date.now() - (state.museAt || 0) > 5200) {
      state.museAt = Date.now();
      state.museIdx = ((state.museIdx ?? -1) + 1) % pending.length;
      const s = state.byKey[pending[state.museIdx]];
      muse.classList.add("fade");
      setTimeout(() => {
        muse.innerHTML = "<b>" + esc(s.short) + "</b> đang cân nhắc: " + esc(questionOf(s).replace(/^./, (c) => c.toLowerCase())) + (done ? " · " + done + "/" + seats.length + " ghế xong" : "");
        muse.classList.remove("fade");
        $$(".seat").forEach((el) => el.classList.toggle("musing", el.dataset.seat === s.key));
      }, 300);
    }
  } else {
    bar.classList.add("indeterminate");
    $("#wcBar").style.width = "";
    muse.textContent = "";
    $$(".seat.musing").forEach((e) => e.classList.remove("musing"));
  }
}

// ------------------------------------------------------------- PDF
async function savePdf(btn) {
  const id = btn.dataset.pdf;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "Đang tạo PDF...";
  try {
    let setup = state.setup, verdict = state.verdict, chairView = state.chairView;
    if (id) { // a past session from the history list
      const j = await fetch("/api/sessions/" + encodeURIComponent(id)).then((x) => x.json());
      setup = j.events.find((e) => e.type === "setup");
      verdict = [...j.events].reverse().find((e) => e.type === "verdict");
      chairView = [...j.events].reverse().find((e) => e.type === "chair_view");
    }
    if (!setup || !verdict) throw new Error("Hội đồng này chưa có kết luận.");
    await downloadVerdictPdf({ setup, verdict, chairView, byKey: state.byKey, id: id || state.session });
  } catch (e) {
    console.error(e);
    toast("Không tạo được PDF: " + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

// ------------------------------------------------------------- misc
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 6000);
}
async function refreshUsage() {
  const u = await fetch("/api/usage").then((x) => x.json()).catch(() => null);
  if (!u || !u.calls) { $("#usage").textContent = ""; return; }
  const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
  $("#usage").textContent = `${u.calls} lượt gọi · ${k(u.input + u.cacheRead + u.cacheWrite)} vào · ${k(u.output)} ra`;
}

boot();
