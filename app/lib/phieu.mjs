import fs from "node:fs";
import path from "node:path";
import { byKey, loadRoster } from "./seats.mjs";

export const NHAN = { "GO": "LÀM", "GO WITH CONDITIONS": "LÀM, CÓ ĐIỀU KIỆN", "RESHAPE": "ĐIỀU CHỈNH", "WAIT": "CHỜ", "DON'T DO IT": "KHÔNG LÀM" };
const HAN_NGAY = 30;
const dong = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const cut = (s, n) => { s = dong(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const o = (s) => dong(s).replace(/\|/g, "/");

export function slugVi(text) {
  return String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

const traLoi = (t) => [t?.chon, t?.tu_go && `tự gõ: ${t.tu_go}`].filter(Boolean).join("; ") || "bỏ trống";

export const DONG_Y = { "đồng ý": "Đồng ý", "đồng ý có điều kiện": "Đồng ý có điều kiện", "không đồng ý": "Không đồng ý" };
/** A line that holds a quote the brain check could not find gets a note, so the phiếu never keeps a made-up quote as checked. */
const danhDau = (quotes) => {
  const sai = (quotes ?? []).filter((q) => !q.verified).map((q) => dong(q.quote));
  return (t) => (sai.some((q) => q && t.includes(q)) ? `${t} _(câu trích chưa khớp nguyên văn)_` : t);
};
/** Góc nhìn Chủ toạ (lượt chair_view): đồng ý hay không, lý do có khung và mã nguồn, bước nên xoá, thử nhanh. */
function gocNhin(cv, quotes) {
  if (!cv) return ["Chưa có góc nhìn Chủ toạ."];
  const d = danhDau(quotes);
  return [
    d(`**${DONG_Y[cv.dong_y] || dong(cv.dong_y)}.** ${dong(cv.nhan_dinh)}`), "",
    ...(cv.ly_do ?? []).map((l) => d(`- ${dong(l.y)}${l.khung || l.nguon ? ` (${[l.khung, l.nguon].map(dong).filter(Boolean).join(", ")})` : ""}`)),
    ...(cv.bo_buoc ? [d(`- **Nên xoá:** ${dong(cv.bo_buoc)}`)] : []),
    ...(cv.thu_nhanh ? [d(`- **Thử nhanh:** ${dong(cv.thu_nhanh)}`)] : []),
  ];
}

/** Số dùng trong kết luận (kiemSo): mỗi số một dòng có nhãn nguồn; số kê là số liệu mà không thấy trong số liệu thì ghi chú. */
const soDung = (ks) => (ks?.so_lieu ?? []).map((e) => `- **${dong(e.so)}**: ${dong(e.y)} (${dong(e.loai)}${e.nguon ? `: ${dong(e.nguon)}` : ""})${e.trang_thai === "khong_thay" ? " _(không thấy trong số liệu)_" : ""}`);
const giaDinh = (ks) => (ks?.gia_dinh ?? []).map((e) => `- **${dong(e.so)}**: ${dong(e.y)}. Kiểm: ${dong(e.nguon)}`);
const chuaNguon = (ks, ksChuToa) => [
  ...(ks?.chua_nguon ?? []).map((x) => `- **${dong(x.so)}**: ${dong(x.doan)}`),
  ...(ksChuToa?.chua_nguon ?? []).map((x) => `- **${dong(x.so)}** (Góc nhìn Chủ toạ): ${dong(x.doan)}`),
];

const muc = (tieuDe, dongs) => (dongs.length ? [`## ${tieuDe}`, "", ...dongs, ""] : []);

function noiDung({ hoi, setup, verdict, chairView, chairQuotes, chairKiemSo, sessionId, today, han }) {
  try { loadRoster(); } catch { /* không có roster thì giữ key */ }
  const tenGhe = (k) => byKey[k]?.short || byKey[k]?.name || k;
  const opts = setup?.options ?? [];
  const nhan = NHAN[verdict.label] || verdict.label;
  const pa = opts.find((x) => x.id === verdict.recommended);
  const luot = (hoi.luot ?? []).map((l) => {
    const tl = new Map((l.tra_loi ?? []).map((t) => [t.id, t]));
    return [`### Lượt ${l.so}`, ...(l.cau_hoi ?? []).map((q) => `- ${dong(q.hoi)} → ${tl.has(q.id) ? traLoi(tl.get(q.id)) : "chưa trả lời"}`), ...(l.nhan_xet_so ? [`- Nhận xét số: ${dong(l.nhan_xet_so)}`] : [])].join("\n");
  });
  const vong = [...(hoi.bo_qua_vong_hoi ? ["Người hỏi chọn bỏ vòng hỏi."] : []), ...luot];
  const canh = dong(hoi.de_bai?.canh_bao);
  const sl = [...(canh ? [`- **Cảnh báo:** ${canh}`] : []), ...(hoi.facts?.su_that ?? []).map((s) => `- ${dong(s.y)} — ${dong(s.so)} — ${dong(s.nguon)} — ${dong(s.ngay)}`)];
  const L = [
    `# ${dong(setup?.title || hoi.cauHoi)}`, "",
    `Hội đồng chuyên gia · ${today} · phiên ${sessionId}`, "",
    ...muc("Câu hỏi", [hoi.cauHoi]),
    ...muc(hoi.bo_qua_vong_hoi ? "Vấn đề gốc (lấy nguyên câu hỏi — người hỏi bỏ vòng hỏi)" : "Vấn đề gốc (người hỏi chốt)", [hoi.van_de_goc]),
    ...muc("Nếu phải quyết hôm nay, người hỏi chọn", [hoi.tra_loi_ban_dau || "chưa nêu"]),
    ...muc("Vòng hỏi", vong.flatMap((x, i) => (i ? ["", x] : [x]))),
    ...muc("Số liệu đã đọc", sl),
    ...muc("Kết luận", [`**${nhan}**${pa ? ` — phương án ${pa.id}: ${dong(pa.label)}` : ""}`, "", verdict.call, "", `Độ tin cậy: ${verdict.confidence ?? "-"}/10. Xem lại trước ${han}.`]),
    ...muc("Góc nhìn Chủ toạ", gocNhin(chairView, chairQuotes)),
    ...muc("Số dùng trong kết luận", soDung(verdict.kiem_so)),
    ...muc("Giả định cần kiểm", giaDinh(verdict.kiem_so)),
    ...muc("Số chưa có nguồn", chuaNguon(verdict.kiem_so, chairKiemSo)),
    ...muc("Điểm", opts.map((x) => `- ${x.id}. ${dong(x.label)}: ${verdict.scores?.[x.id]?.score ?? "-"}`)),
    ...muc("Vì sao", (verdict.why ?? []).map((w) => `- ${dong(w.point)} (${tenGhe(w.seat)})`)),
    ...muc("Bước tiếp theo", (verdict.next_steps ?? []).map((n) => `- **${dong(n.when)}:** ${dong(n.action)}`)),
    ...muc("Dừng nếu", verdict.kill_criteria ? [verdict.kill_criteria] : []),
  ];
  return L.join("\n");
}

const cong30 = (today) => new Date(new Date(`${today}T00:00:00Z`).getTime() + HAN_NGAY * 86400000).toISOString().slice(0, 10);

// Sổ mới cho người dùng chưa có: một bảng, mới nhất lên đầu.
const SO_MOI = `# Sổ phiếu quyết định

Hội đồng chuyên gia ghi mỗi phiếu ở đây, mới nhất lên đầu. Phiếu quá "Hạn xem lại" mà còn \`mo\` thì nên mở lại xem kết quả.

| Ngày | Câu hỏi | Kết luận | Hạn xem lại | Trạng thái | File |
|---|---|---|---|---|---|
`;

/** Ghi phiếu vào `dir` rồi chèn một dòng ngay dưới `|---|` của 00-so-phieu.md (nếu sổ có). Chỉ ghi trong `dir`. */
export function ghiPhieu({ dir, hoi, setup, verdict, chairView = null, chairQuotes = [], chairKiemSo = null, sessionId, today }) {
  const han = cong30(today);
  const slug = slugVi(setup?.title || hoi.cauHoi) || "phieu";
  fs.mkdirSync(dir, { recursive: true });
  let ten = `${today}-hoi-dong-${slug}.md`;
  for (let i = 2; fs.existsSync(path.join(dir, ten)); i++) ten = `${today}-hoi-dong-${slug}-${i}.md`;
  const file = path.join(dir, ten);
  fs.writeFileSync(file, noiDung({ hoi, setup, verdict, chairView, chairQuotes, chairKiemSo, sessionId, today, han }));

  const so = path.join(dir, "00-so-phieu.md");
  if (!fs.existsSync(so)) fs.writeFileSync(so, SO_MOI);
  if (fs.existsSync(so)) {
    const lines = fs.readFileSync(so, "utf8").split("\n");
    const i = lines.findIndex((l) => /^\|[\s:|-]*---[\s:|-]*$/.test(l));
    if (i >= 0) {
      const nhan = NHAN[verdict.label] || verdict.label;
      lines.splice(i + 1, 0, `| ${today} | ${o(cut(hoi.cauHoi, 160))} | ${o(cut(verdict.call || nhan, 160))} | ${han} | mo | [file](${ten}) |`);
      fs.writeFileSync(so, lines.join("\n"));
    }
  }
  return file;
}

const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** Họp tiếp: nối "Lần họp n" vào cuối phiếu cũ (một quyết định một phiếu), rồi sửa đúng dòng sổ trỏ
 * tới file đó: cột Kết luận thành "(họp lần n dd/mm) <call>", Hạn xem lại thành hôm nay + 30 ngày.
 * Không có sổ, hoặc sổ không có dòng đó, thì chỉ nối vào file. */
export function ghiHopTiep({ dir, file, lan, boSung, setup, verdict, chairView, quotes = [], chairKiemSo = null, today }) {
  const pa = (setup?.options ?? []).find((x) => x.id === verdict.recommended);
  const nhan = NHAN[verdict.label] || verdict.label;
  const ds = (tieuDe, xs) => (xs.length ? [`**${tieuDe}:**`, ...xs, ""] : []);
  const L = [
    "", `## Lần họp ${lan} (${today})`, "",
    `**Bổ sung:** ${dong(boSung)}`, "",
    `**Kết luận:** ${nhan} · ${dong(verdict.call)}${pa ? ` (phương án ${pa.id}: ${dong(pa.label)})` : ""}`, "",
    ...ds("Vì sao", (verdict.why ?? []).map((w) => `- ${dong(w.point)}`)),
    ...ds("Điều kiện", (verdict.conditions ?? []).map((c) => `- ${dong(c)}`)),
    ...ds("Bước tiếp theo", (verdict.next_steps ?? []).map((n) => `- ${dong(n.when)}: ${dong(n.action)}`)),
    ...(verdict.kill_criteria ? [`**Dừng nếu:** ${dong(verdict.kill_criteria)}`, ""] : []),
    danhDau(quotes)(`**Góc nhìn Chủ toạ:** ${chairView ? `${DONG_Y[chairView.dong_y] || dong(chairView.dong_y)}. ${dong(chairView.nhan_dinh)}` : "Chưa có góc nhìn Chủ toạ."}`), "",
    ...((verdict.kiem_so?.gia_dinh ?? []).length ? [`**Giả định cần kiểm:** ${verdict.kiem_so.gia_dinh.map((e) => `${dong(e.so)} (${dong(e.y)})`).join("; ")}`, ""] : []),
    ...(chuaNguon(verdict.kiem_so, chairKiemSo).length ? [`**Số chưa có nguồn:** ${[...(verdict.kiem_so?.chua_nguon ?? []).map((x) => dong(x.so)), ...(chairKiemSo?.chua_nguon ?? []).map((x) => `${dong(x.so)} (Góc nhìn Chủ toạ)`)].join(", ")}`, ""] : []),
  ];
  const cu = fs.readFileSync(file, "utf8");
  fs.appendFileSync(file, (cu.endsWith("\n") ? "" : "\n") + L.join("\n"));

  const so = path.join(dir, "00-so-phieu.md");
  if (fs.existsSync(so)) {
    const lines = fs.readFileSync(so, "utf8").split("\n");
    const i = lines.findIndex((l) => l.startsWith("|") && l.includes(`(${path.basename(file)})`));
    const c = i >= 0 ? lines[i].split(" | ") : [];
    if (c.length === 6) {
      c[2] = o(cut(`(họp lần ${lan} ${ddmm(today)}) ${verdict.call || nhan}`, 180));
      c[3] = cong30(today);
      lines[i] = c.join(" | ");
      fs.writeFileSync(so, lines.join("\n"));
      return { file, so: true };
    }
  }
  return { file, so: false };
}

/** The phiếu a follow-up appends to must be a .md file that still exists, directly inside the phiếu
 * folder in use. A saved session pointing elsewhere (another PHIEU_DIR, a hand-edited path) is refused. */
export function phieuTrongThuMuc(dir, file) {
  const f = path.resolve(file);
  if (path.dirname(f) !== path.resolve(dir) || !f.endsWith(".md")) throw new Error(`Phiếu nằm ngoài thư mục phiếu hiện tại: ${file}`);
  if (!fs.existsSync(f)) throw new Error(`Phiếu không còn: ${file}`);
  return f;
}
