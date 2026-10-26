// Luật số liệu: hội đồng chỉ được dùng số của người hỏi (đề bài, phần bổ sung, tờ số liệu thư ký trình
// từ thư mục tài liệu) hoặc phép tính từ những số đó.
// Sau kết luận, máy dò lại từng con số và gắn cờ số không có nguồn.

export const LUAT_SO = `NUMBERS RULE (strict, no exceptions)
- Every number you state about this business must come from: (1) the founder's brief or additions, (2) the SỐ LIỆU section (the secretary's sheet of numbers read from the founder's documents folder, each with its source file), or (3) arithmetic on those, shown briefly, e.g. "1,70 tỷ ÷ 1.096 đơn = 1,55 triệu/đơn".
- Never use industry averages, typical rates, numbers from memory, or another company's numbers as this business's numbers. Numbers from your own companies stay labeled as yours.
- If a number you need is missing, write "Chưa có số: <what>" and turn measuring it into a step or a condition. Do not fill it in.
- If you must estimate to compare options, write "GIẢ ĐỊNH: <the number and what it is>", why, and how to check it within 30 days.
- A range or a percentage must say which numbers it comes from.`;

// Ngày, giờ, tháng, mã nguồn, năm: không phải số liệu, xoá trước khi dò.
const KHONG_PHAI_SO = [
  /\b\d{4}-\d{2}(?:-\d{2})?\b/g,              // 2026-11-16, 2026-09
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,      // 28/10, 28/10/2026
  /\b\d{1,2}:\d{2}\b/g,                        // 10:50
  /\b[STQ]\d{1,3}\b/g,                         // S014, T11, Q4
  /\b(?:tháng|lần|vòng|tuần|ngày|quý|phương án|năm)\s+\d{1,2}\b/gi, // tháng 9, lần 2
  /\b(?:19|20)\d{2}\b(?![.,]\d)/g,             // năm 2026
];
// thời hạn số nguyên (thử 14 ngày, trong 30 ngày): chỉ bỏ khi quét chữ của kết luận; "7,1 ngày chờ" vẫn là số liệu
const THOI_HAN = /(?<![\d.,])\d+\s+(?:ngày|tuần|tháng|năm|giờ|phút)(?![\p{L}])/gu;
const SO = /(?<![\p{L}\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?:\s*(%|tỷ|ty|triệu|trieu|tr|nghìn|ngàn|k)(?![\p{L}]))?/gu;
const NHAN = { "tỷ": 1e9, ty: 1e9, "triệu": 1e6, trieu: 1e6, tr: 1e6, "nghìn": 1e3, "ngàn": 1e3, k: 1e3 };

function giaTri(raw, donVi) {
  let s = raw;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");   // 1.698.960.000 / 1.096
  else if (/^\d+,\d{3}$/.test(s) && !donVi) s = s.replace(",", "");                         // 1,258 đơn
  else s = s.replace(",", ".");                                                             // 5,6 / 1,70 tỷ
  return Number(s) * (NHAN[donVi] || 1);
}

/** Các con số trong một đoạn chữ, theo thứ tự xuất hiện: { so (nguyên văn), value, pct, i, ketQua }.
 * Luôn bỏ ngày tháng, giờ, mã nguồn, năm. `chu: true` (quét chữ của kết luận) bỏ thêm thời hạn số nguyên và số đếm
 * một chữ số không đơn vị (2 người); đầu vào và danh sách số đã kê thì giữ hết (7 đơn, 8 tuần là số liệu).
 * ketQua: số đứng ngay sau "=" hoặc "≈", tức kết quả của một phép tính. */
export function soTrong(text, { chu = true } = {}) {
  let t = String(text ?? "");
  for (const re of [...KHONG_PHAI_SO, ...(chu ? [THOI_HAN] : [])]) t = t.replace(re, (m) => " ".repeat(m.length));
  const out = [];
  for (const m of t.matchAll(SO)) {
    const [, raw, donVi] = m;
    if (chu && !donVi && /^\d$/.test(raw)) continue;
    const value = giaTri(raw, donVi);
    if (!Number.isFinite(value)) continue;
    out.push({ so: donVi ? `${raw}${donVi === "%" ? "" : " "}${donVi}` : raw, value, pct: donVi === "%", i: m.index, ketQua: /[=≈]\s*$/.test(t.slice(Math.max(0, m.index - 3), m.index)) });
  }
  return out;
}

const gan = (a, b) => (a === b) || (Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.02));
const coTrong = (v, kho) => kho.some((x) => gan(v, x));

// Ngày trong tháng của mọi ngày dd/mm, dd/mm/yyyy: soTrong xoá ngày trước khi dò, nhưng số ngày tính từ ngày đó là có nguồn
// ("tháng 10 (tới 26/10)" → 207 đơn trong 26 ngày, 207 ÷ 26 × 7).
const NGAY = /\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g;
const ngayTrong = (t) => [...String(t ?? "").matchAll(NGAY)].map((m) => [Number(m[1]), Number(m[2])]).filter(([d, th]) => d >= 1 && d <= 31 && th >= 1 && th <= 12).map(([d]) => d);
// Hằng lịch dùng được làm toán hạng của phép tính (không thành số liệu tự do): 7 ngày một tuần, 28–31 ngày một tháng.
const HANG_LICH = [7, 28, 29, 30, 31];

/** Dò số trong `vanBan` (kết luận, góc nhìn Chủ toạ) với đầu vào được phép.
 * dauVao: chữ của đề bài + bổ sung + tờ số liệu; cacBan: số do app tự tính (điểm, độ tin cậy);
 * soLieu: danh sách model tự kê { so, y, loai: "đề bài"|"số liệu"|"tính"|"giả định", nguon }.
 * Ngày trong tháng của các ngày dd/mm trong dauVao và hằng lịch (7, 28–31) chỉ dùng được làm toán hạng của phép "tính",
 * và phép tính phải có ít nhất một toán hạng không phải hằng lịch.
 * Trả { so_lieu (kèm trang_thai: co_nguon | gia_dinh | khong_thay), chua_nguon: [{ so, doan }], gia_dinh }. */
export function kiemSo({ dauVao = "", soLieu = [], cacBan = [], vanBan = "" }) {
  const kho = [...soTrong(dauVao, { chu: false }).map((x) => x.value), ...cacBan.filter((x) => typeof x === "number")];
  // days of the month from dates in the inputs ("tới 26/10", a sheet line's date) are operands only: as free values
  // they would source any made-up number equal to that day
  const khoNgay = ngayTrong(dauVao);
  const duoc = [...kho], giaDinh = [];
  const ke = (soLieu ?? []).map((e) => ({ ...e, vals: soTrong(e.so, { chu: false }).map((x) => x.value), trang_thai: "khong_thay" }));
  // two passes: a computed number may use another computed number
  for (let lan = 0; lan < 2; lan++) {
    for (const e of ke) {
      if (e.trang_thai !== "khong_thay" || !e.vals.length) continue;
      if (e.loai === "giả định") { e.trang_thai = "gia_dinh"; giaDinh.push(...e.vals); continue; }
      // arithmetic: every operand needs a source; the numbers after "=" or "≈" are its (intermediate) results
      // (an earlier step's result may be the next step's operand)
      // a date in the arithmetic ("tới 26/10") is an operand too: its day of the month
      const pt = e.loai === "tính" ? [...soTrong(e.nguon, { chu: false }), ...ngayTrong(e.nguon).map((value) => ({ value, ketQua: false }))] : [];
      const tinhRa = [];
      const ok = e.loai === "tính"
        ? pt.some((x) => !x.ketQua && !HANG_LICH.includes(x.value)) && pt.every((x) => (x.ketQua ? (tinhRa.push(x.value), true) : coTrong(x.value, duoc) || coTrong(x.value, tinhRa) || coTrong(x.value, khoNgay) || HANG_LICH.includes(x.value)))
        : e.vals.every((v) => coTrong(v, kho));
      if (ok) { e.trang_thai = "co_nguon"; duoc.push(...e.vals, ...pt.filter((x) => x.ketQua).map((x) => x.value)); }
    }
  }
  const chua = [], thay = new Set();
  const t = String(vanBan ?? "");
  for (const x of soTrong(t)) {
    if (coTrong(x.value, duoc) || coTrong(x.value, giaDinh) || thay.has(x.so)) continue;
    thay.add(x.so);
    const a = Math.max(0, x.i - 40), b = Math.min(t.length, x.i + x.so.length + 40);
    chua.push({ so: x.so, doan: `${a ? "…" : ""}${t.slice(a, b).replace(/\s+/g, " ").trim()}${b < t.length ? "…" : ""}` });
  }
  return {
    so_lieu: ke.map(({ vals, ...e }) => e),
    chua_nguon: chua,
    gia_dinh: ke.filter((e) => e.trang_thai === "gia_dinh").map(({ vals, ...e }) => e),
  };
}
