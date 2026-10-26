// The Hội đồng chuyên gia verdict as a one or two page branded PDF, built in the browser with a
// vendored jsPDF, so the room still needs nothing installed. White page, Montserrat,
// dark blue type, sky blue as the accent only.

const C = {
  ink: [7, 18, 28], soft: [55, 68, 82], mute: [112, 124, 138], rule: [226, 231, 237],
  tint: [243, 246, 249], track: [228, 233, 239], accent: [55, 189, 248], white: [255, 255, 255],
};
const LABEL = { go: [63, 207, 142], amber: [255, 144, 37], red: [255, 90, 79] };
const labelColor = (l) => (/DON'T/.test(l) ? LABEL.red : /RESHAPE|WAIT/.test(l) ? LABEL.amber : LABEL.go);
// Chủ toạ trả nhãn tiếng Anh; báo cáo in bản tiếng Việt.
const VERDICT_VI = { "GO": "LÀM", "GO WITH CONDITIONS": "LÀM, CÓ ĐIỀU KIỆN", "RESHAPE": "ĐIỀU CHỈNH", "WAIT": "CHỜ", "DON'T DO IT": "KHÔNG LÀM" };
const VOTE_VI = { endorse: "Đồng ý", amend: "Sửa đổi", dissent: "Phản đối" };
const DONG_Y_VI = { "đồng ý": "Đồng ý", "đồng ý có điều kiện": "Đồng ý có điều kiện", "không đồng ý": "Không đồng ý" };
const DISCLAIMER_VI = "Cố vấn mô phỏng, dựng từ tác phẩm công khai của từng người. Họ không phải người thật và không phát ngôn thay những người đó.";

let libReady = null;
function loadLib() {
  if (window.jspdf) return Promise.resolve();
  libReady ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "/vendor/jspdf.umd.min.js";
    s.onload = res;
    s.onerror = () => rej(new Error("could not load the PDF library"));
    document.head.appendChild(s);
  });
  return libReady;
}

const fileCache = {};
async function fetchBase64(url) {
  if (fileCache[url]) return fileCache[url];
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return (fileCache[url] = btoa(bin));
}

async function addFonts(doc) {
  for (const [file, style] of [["Montserrat-Regular.ttf", "normal"], ["Montserrat-SemiBold.ttf", "semibold"], ["Montserrat-Bold.ttf", "bold"]]) {
    doc.addFileToVFS(file, await fetchBase64(`/brand/fonts/${file}`));
    doc.addFont(file, "Montserrat", style);
  }
}

const clean = (t) => String(t ?? "").replace(/\s*\((?:S\d+|source[^)]*)[^)]*\)/gi, "").replace(/\*\*/g, "").replace(/[—–]/g, ", ").replace(/\s+/g, " ").trim();
const dateLine = (id) => {
  const m = String(id || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export async function downloadVerdictPdf({ setup, verdict: ev, chairView, byKey, id }) {
  await loadLib();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  await addFonts(doc);
  const logo = "data:image/png;base64," + (await fetchBase64("/brand/logo.png")); // replace app/public/brand/logo.png to rebrand

  const v = ev.verdict;
  const seats = ev.seats || [];
  const options = setup.options || [];
  const seatKey = (x) => {
    const t = String(x || "").toLowerCase().trim();
    return Object.values(byKey).find((s) => s.key === t.replace(/\s+/g, "") || s.short.toLowerCase() === t || s.name.toLowerCase() === t || t.includes(s.name.split(" ").pop().toLowerCase()))?.key;
  };
  const who = (x) => byKey[seatKey(x)]?.name || x || "";

  const W = 612, H = 792, M = 54, CW = W - M * 2;
  let y = M;

  const font = (size, style = "normal", color = C.ink) => { doc.setFont("Montserrat", style); doc.setFontSize(size); doc.setTextColor(...color); };
  const lines = (text, width, size, style = "normal") => { font(size, style); return doc.splitTextToSize(clean(text), width); };
  const lh = (size) => size * 1.42;
  const ensure = (h) => { if (y + h > H - 64) { doc.addPage(); y = M; } };
  const para = (text, { size = 10.5, style = "normal", color = C.soft, x = M, width = CW, gap = 6 } = {}) => {
    const ls = lines(text, width, size, style);
    ensure(ls.length * lh(size));
    font(size, style, color);
    doc.text(ls, x, y + size, { lineHeightFactor: 1.42 });
    y += ls.length * lh(size) + gap;
  };
  const kicker = (text) => { font(8, "semibold", C.mute); doc.setCharSpace(1.2); doc.text(text.toUpperCase(), M, y + 8); doc.setCharSpace(0); y += 16; };
  // `keep` is how much of what follows must sit on the same page as the heading
  const section = (title, keep = 70) => {
    ensure(48 + keep);
    y += 10;
    doc.setDrawColor(...C.rule); doc.setLineWidth(0.75); doc.line(M, y, W - M, y);
    y += 16;
    font(12.5, "bold", C.ink); doc.text(title, M, y + 10);
    y += 22;
  };
  const bullet = (label, text) => {
    const pre = label ? (/[?!.:]$/.test(label.trim()) ? `${label.trim()} ` : `${label}: `) : "";
    font(10.5, "semibold");
    // a long label (a whole question) gets its own bold line instead of squeezing the text
    if (pre && doc.getTextWidth(pre) > CW * 0.4) {
      const head = lines(label, CW - 14, 10.5, "semibold");
      const body = lines(text, CW - 14, 10.5);
      ensure((head.length + body.length) * lh(10.5) + 4);
      doc.setFillColor(...C.accent); doc.circle(M + 3, y + 6.6, 2.2, "F");
      font(10.5, "semibold", C.ink); doc.text(head, M + 14, y + 10.5, { lineHeightFactor: 1.42 });
      y += head.length * lh(10.5);
      font(10.5, "normal", C.soft); doc.text(body, M + 14, y + 10.5, { lineHeightFactor: 1.42 });
      y += body.length * lh(10.5) + 5;
      return;
    }
    const preW = pre ? doc.getTextWidth(pre) : 0;
    const body = lines(text, CW - 14 - preW, 10.5);
    // first line sits after the bold label; the rest wraps under the full width
    const rest = body.length > 1 ? lines(body.slice(1).join(" "), CW - 14, 10.5) : [];
    ensure((1 + rest.length) * lh(10.5) + 4);
    doc.setFillColor(...C.accent); doc.circle(M + 3, y + 6.6, 2.2, "F");
    if (pre) { font(10.5, "semibold", C.ink); doc.text(pre, M + 14, y + 10.5); }
    font(10.5, "normal", C.soft);
    doc.text(body[0] || "", M + 14 + preW, y + 10.5);
    if (rest.length) doc.text(rest, M + 14, y + 10.5 + lh(10.5), { lineHeightFactor: 1.42 });
    y += (1 + rest.length) * lh(10.5) + 5;
  };

  // ---------------------------------------------------------------- header
  doc.addImage(logo, "PNG", M, y - 4, 34, 34, "logo", "SLOW");
  font(15, "bold", C.ink); doc.text("Hội đồng chuyên gia", W - M, y + 12, { align: "right" });
  font(8.5, "normal", C.mute); doc.text(`Báo cáo kết luận · ${dateLine(id)}`, W - M, y + 25, { align: "right" });
  y += 40;
  doc.setDrawColor(...C.ink); doc.setLineWidth(1.2); doc.line(M, y, W - M, y);
  y += 26;

  // ---------------------------------------------------------------- the decision
  kicker("Quyết định");
  const title = lines(setup.title || "Quyết định chưa đặt tên", CW, 22, "bold");
  font(22, "bold", C.ink); doc.text(title, M, y + 20, { lineHeightFactor: 1.18 });
  y += title.length * 22 * 1.18 + 8;
  const n = seats.length || (setup.seats || []).length;
  const rounds = v.votes ? 3 : 2;
  para(`${setup.mode === "quick" ? "Hội đồng nhanh" : "Hội đồng đầy đủ"} · ${n} cố vấn · ${rounds} vòng`, { size: 9.5, color: C.mute, gap: 4 });
  if (setup.decision) para(setup.decision, { size: 10.5, color: C.soft, gap: 8 });

  // ---------------------------------------------------------------- the verdict box
  const label = String(v.label || "").toUpperCase();
  const shown = VERDICT_VI[label] || label;
  font(13, "bold");
  const badgeW = doc.getTextWidth(shown) + 24;
  const callLines = lines(v.call, CW - 32, 12.5, "semibold");
  const meta = [`Độ tin cậy ${v.confidence ?? "-"}/10`, v.votes ? `${v.votes.endorse || 0} đồng ý, ${v.votes.amend || 0} sửa đổi, ${v.votes.dissent || 0} phản đối` : ""].filter(Boolean).join(" · ");
  const boxH = 16 + 28 + 12 + callLines.length * lh(12.5) + 8 + 14 + 14;
  ensure(boxH + 10);
  y += 6;
  doc.setFillColor(...C.tint); doc.roundedRect(M, y, CW, boxH, 10, 10, "F");
  doc.setFillColor(...labelColor(label)); doc.roundedRect(M + 16, y + 16, badgeW, 28, 7, 7, "F");
  font(13, "bold", C.ink); doc.text(shown, M + 16 + 12, y + 16 + 19);
  font(8, "semibold", C.mute); doc.setCharSpace(1.2); doc.text("KẾT LUẬN CỦA HỘI ĐỒNG", M + 16 + badgeW + 12, y + 16 + 17.5); doc.setCharSpace(0);
  let by = y + 16 + 28 + 12;
  font(12.5, "semibold", C.ink); doc.text(callLines, M + 16, by + 12.5, { lineHeightFactor: 1.42 });
  by += callLines.length * lh(12.5) + 8;
  font(9.5, "normal", C.mute); doc.text(meta, M + 16, by + 9.5);
  y += boxH + 8;

  // ---------------------------------------------------------------- the Chair's own view
  // His comment on the verdict, from his own brain. The verdict above stays the council's.
  const cv = chairView?.view;
  if (cv) {
    section("Góc nhìn Chủ toạ");
    const say = `${DONG_Y_VI[cv.dong_y] || cv.dong_y}. ${cv.nhan_dinh}`;
    para((chairView.quotes || []).some((q) => !q.verified && say.includes(q.quote)) ? `${say} (câu trích chưa khớp nguyên văn)` : say, { size: 10.5, style: "semibold", color: C.ink, gap: 6 });
    // a quote the brain check could not find is marked here too; the source id stays readable as "nguồn S0xx"
    const sai = (chairView.quotes || []).filter((q) => !q.verified).map((q) => q.quote);
    const ghi = (t) => (sai.some((q) => String(t || "").includes(q)) ? `${t} (câu trích chưa khớp nguyên văn)` : t);
    for (const l of (cv.ly_do || []).slice(0, 4)) bullet(l.khung, ghi(`${l.y}${l.nguon ? ` (nguồn ${l.nguon})` : ""}`));
    if (cv.bo_buoc) bullet("Nên xoá", ghi(cv.bo_buoc));
    if (cv.thu_nhanh) bullet("Thử nhanh", ghi(cv.thu_nhanh));
  }

  // ---------------------------------------------------------------- numbers and their sources
  const ks = v.kiem_so;
  const ksChuToa = chairView?.kiem_so;
  if (ks?.so_lieu?.length || ks?.chua_nguon?.length || ksChuToa?.chua_nguon?.length) {
    section("Số dùng trong kết luận");
    const chua = [...(ks?.chua_nguon || []).map((x) => x.so), ...(ksChuToa?.chua_nguon || []).map((x) => `${x.so} (Góc nhìn Chủ toạ)`)];
    if (chua.length) para(`Chưa có nguồn: ${chua.join(", ")}`, { size: 10.5, style: "semibold", color: [180, 83, 9], gap: 6 });
    for (const e of (ks?.so_lieu || []).slice(0, 14)) bullet(e.so, `${e.y} (${e.loai}${e.nguon ? `: nguồn ${e.nguon}` : ""})${e.trang_thai === "khong_thay" ? " — không thấy trong số liệu" : ""}`);
  }

  // ---------------------------------------------------------------- scores
  section("Điểm");
  const best = v.recommended;
  for (const o of options) {
    const sc = v.scores?.[o.id]?.score;
    const isBest = o.id === best;
    const lab = lines(o.label, CW - 200, 10.5, isBest ? "semibold" : "normal");
    const rowH = Math.max(24, lab.length * lh(10.5) + 6);
    ensure(rowH + 6);
    doc.setFillColor(...(isBest ? C.ink : C.track)); doc.roundedRect(M, y, 20, 20, 5, 5, "F");
    font(10, "bold", isBest ? C.white : C.soft); doc.text(o.id, M + 10, y + 13.8, { align: "center" });
    font(10.5, isBest ? "semibold" : "normal", C.ink); doc.text(lab, M + 30, y + 13.5, { lineHeightFactor: 1.42 });
    const bx = W - M - 170, bw = 120;
    doc.setFillColor(...C.track); doc.roundedRect(bx, y + 8, bw, 5, 2.5, 2.5, "F");
    if (typeof sc === "number") { doc.setFillColor(...(isBest ? C.accent : [150, 205, 235])); doc.roundedRect(bx, y + 8, Math.max(5, bw * sc / 10), 5, 2.5, 2.5, "F"); }
    font(14, "bold", C.ink); doc.text(typeof sc === "number" ? String(sc) : "-", W - M, y + 15, { align: "right" });
    if (isBest) { font(7.5, "semibold", C.accent); doc.text("ĐỀ XUẤT", bx, y + 24); }
    y += rowH + 6;
  }
  para("Mỗi cố vấn chấm từng phương án từ 1 đến 10, có trọng số theo mức quan trọng của mảng họ phụ trách trong quyết định này.", { size: 8.5, color: C.mute, gap: 0 });

  // Kept short on purpose: the call, the scores, the reasons, the strongest objection, and
  // the plan. The full report (conditions, amendments, every card) stays in verdict.md.
  if (v.why?.length) { section("Vì sao hội đồng đi đến kết luận này"); for (const w of v.why.slice(0, 3)) bullet(who(w.seat), w.point); }

  // ---------------------------------------------------------------- how each advisor scored it
  if (seats.length) {
    section("Từng cố vấn chấm điểm thế nào", 18 + seats.length * 22); // the table stays on one page
    const showVote = Boolean(v.votes);
    const cols = [{ t: "Cố vấn", w: 150 }, { t: "Trọng số", w: 52, c: true }, ...options.map((o) => ({ t: o.id, w: 40, c: true })), ...(showVote ? [{ t: "Phiếu", w: 70 }] : [])];
    const head = () => {
      let x = M; font(8, "semibold", C.mute);
      for (const c of cols) { doc.text(c.t.toUpperCase(), c.c ? x + c.w / 2 : x, y + 8, c.c ? { align: "center" } : undefined); x += c.w; }
      y += 14; doc.setDrawColor(...C.rule); doc.setLineWidth(0.75); doc.line(M, y, W - M, y); y += 4;
    };
    ensure(40); head();
    for (const s of seats) {
      if (y + 22 > H - 64) { doc.addPage(); y = M; head(); }
      const info = byKey[s.key] || {};
      let x = M;
      font(10, "semibold", C.ink); doc.text(info.name || s.key, x, y + 13); x += cols[0].w;
      font(10, "normal", C.soft); doc.text(String(s.weight ?? "-"), x + cols[1].w / 2, y + 13, { align: "center" }); x += cols[1].w;
      for (const o of options) { font(10, "semibold", C.ink); doc.text(String(s.optionScores?.[o.id] ?? "-"), x + 20, y + 13, { align: "center" }); x += 40; }
      if (showVote) { font(9.5, "normal", C.soft); doc.text(VOTE_VI[s.stance || "endorse"] || String(s.stance), x, y + 13); }
      y += 20; doc.setDrawColor(...C.rule); doc.line(M, y, W - M, y); y += 2;
    }
  }

  // ---------------------------------------------------------------- watch out, what to do
  if (v.minority?.quote) {
    section("Cần lưu ý");
    para(`${who(v.minority.seat)}: "${clean(v.minority.quote)}"`, { size: 10.5, style: "semibold", color: C.ink, gap: 4 });
    if (v.minority.would_have_to_be_true) para(`Để ý kiến này đúng thì: ${v.minority.would_have_to_be_true}`, { size: 9.5, color: C.mute });
  }
  if (v.next_steps?.length || v.cheapest_test || v.kill_criteria) {
    section("Việc làm tiếp theo");
    for (const s of (v.next_steps || []).slice(0, 3)) bullet(s.when, s.action);
    if (v.cheapest_test) bullet("Cách thử rẻ nhất", v.cheapest_test);
    if (v.kill_criteria) bullet("Dừng nếu", v.kill_criteria);
  }
  if (v.fights?.length) { section("Chỗ họ tranh cãi"); for (const f of v.fights.slice(0, 3)) bullet(f.crux, f.story); }

  // ---------------------------------------------------------------- footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...C.rule); doc.setLineWidth(0.75); doc.line(M, H - 46, W - M, H - 46);
    font(7.5, "semibold", C.mute);
    const tag = `Hội đồng chuyên gia · trang ${p}/${pages}`;
    const tagW = doc.getTextWidth(tag);
    doc.text(tag, W - M, H - 34, { align: "right" });
    font(7.5, "normal", C.mute);
    doc.text(doc.splitTextToSize(DISCLAIMER_VI, CW - tagW - 24), M, H - 34, { lineHeightFactor: 1.35 });
  }

  const name = `Hội đồng chuyên gia - ${String(setup.title || id || "verdict").replace(/[\\/:*?"<>|]+/g, "").slice(0, 80)}.pdf`;
  doc.save(name);
  return name;
}
