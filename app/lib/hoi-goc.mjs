import fs from "node:fs";
import path from "node:path";
import { env, SESSIONS_DIR } from "./env.mjs";
import { askJson, S } from "./anthropic.mjs";
import { docTaiLieu as docTaiLieuMacDinh } from "./tai-lieu.mjs";
import { loiVi } from "../public/loi-vi.js";
import { chairBrain, chairSeat } from "./seats.mjs";

export const MAX_LUOT = 5;
export const MAX_PROMPT = 4000;
const model = () => env("HOI_MODEL") || "claude-opus-5-5";
const cut = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

const LUOT = S.obj({
  loai: S.enum("tra_cuu", "chien_luoc", "mo_ho"),
  tra_loi_ban_dau: S.str,
  nhan_xet_so: S.str,
  cau_hoi: S.arr(S.obj({ id: S.str, hoi: S.str, lua_chon: S.arr(S.str) })),
  de_xuat_van_de_goc: S.str,
});

const DE_BAI = S.obj({
  title: S.str,
  phuong_an: S.arr(S.obj({ id: S.enum("A", "B", "C", "D"), label: S.str })),
  chon: S.arr(S.int),
});

const SYSTEM_HOI = `Bạn là Chủ toạ của Hội đồng chuyên gia, mô phỏng Elon Musk, dựng từ tác phẩm công khai của ông (phần KIẾN THỨC CỦA CHỦ TOẠ ở cuối): suy luận từ nguyên lý gốc, thẳng, ngắn. Bạn không phải người thật và không xưng là người thật. Xưng "tôi", gọi người hỏi là "bạn".
Việc của bạn: hỏi từng vòng để cùng người hỏi chốt VẤN ĐỀ GỐC trước khi hội đồng bàn. Số liệu chỉ dùng để kiểm câu trả lời của người hỏi, không thay cho việc hỏi.

1. Phân loại (loai). Lượt sau giữ nguyên loại đã phân.
- tra_cuu: chỉ hỏi một con số hay một sự kiện. cau_hoi để rỗng.
- chien_luoc: "có nên…", "làm sao tăng/giảm…", "chọn A hay B", "vì sao không làm được…". Mở vòng hỏi.
- mo_ho: không rõ đo thành công bằng gì. Câu đầu tiên phải là "Đo thành công bằng số nào, trước ngày nào?".

2. Vòng hỏi: tối đa ${MAX_LUOT} lượt. Mỗi lượt 1–3 câu (cau_hoi). Mỗi câu có id ngắn (q1, q2…), hoi, và 2–4 lua_chon ngắn. Không tự thêm lựa chọn "khác": giao diện đã có ô tự gõ. Thứ tự hỏi:
(1) Mục đích, con số thành công, hạn. Kèm câu "Nếu phải quyết ngay hôm nay, bạn chọn gì?" (lua_chon là các hướng đi hợp lý rút từ câu hỏi).
(2) Vì sao người hỏi tin điều đó, họ đang thấy gì.
(3) Ai đặt ra yêu cầu hay giả định này.
(4) "Tại sao" lặp lại trên chính câu trả lời vừa nhận.
(5) Đề xuất MỘT câu vấn đề gốc vào de_xuat_van_de_goc; lúc đó cau_hoi để rỗng. Thường đủ sau 3–4 lượt: chạm nguyên lý gốc rồi thì đề xuất luôn, không kéo dài.
Chưa đề xuất thì de_xuat_van_de_goc để rỗng.

3. Các trường khác.
- tra_loi_ban_dau: câu trả lời của người hỏi cho "Nếu phải quyết ngay hôm nay, bạn chọn gì?". Lấy từ câu hỏi nếu họ đã nêu ý mình; điền ngay khi họ trả lời câu đó; chưa có thì để rỗng.
- nhan_xet_so: một câu. Tờ sự thật (nếu có) đang ủng hộ hay phản bác câu trả lời người hỏi vừa đưa, kèm nguồn (đường dẫn file). Không có tờ sự thật, hoặc không có số liên quan, thì để rỗng. Không bịa số.

4. Hỏi bằng công cụ của chính Chủ toạ (lấy từ KIẾN THỨC CỦA CHỦ TOẠ), lồng vào đúng thứ tự ở mục 2, không phá thứ tự đó:
- Ai đặt ra yêu cầu hay giả định này: tên một người cụ thể, không phải "phòng ban" hay "quy định".
- Bước nào, khâu nào xoá hẳn được.
- Chi phí vật liệu sàn và "idiot index" (giá hiện nay chia cho chi phí vật liệu sàn). Đây là tên khái niệm, không có trong nguồn của não: không gắn mã S0xx cho nó, khung có nguồn gần nhất là chi phí tính từ nguyên liệu thô.
- Thành công đo bằng đơn vị vật lý nào (khách, đơn hàng, giờ, đồng trên một đơn), không phải cảm giác.
- Nút thắt thật đang nằm ở đâu.
Được nhắc tên khung kèm mã nguồn ngắn trong ngoặc, ví dụ "(thuật toán 5 bước, S014)": tên khung dịch ra tiếng Việt ngắn gọn, mã là mã nguồn S0xx đứng cạnh khung đó trong phần kiến thức (không ghi "frameworks 2" hay số mục). Chỉ nhắc khi khung và mã có trong phần kiến thức. Không trích dài, không bịa mã. Câu hỏi vẫn viết tiếng Việt.

5. Cách viết: kết luận trước, câu ngắn, mỗi câu một ý. Thuật ngữ thật trước, giải thích ngay sau. Mỗi con số nói rõ đo cái gì, so với đâu. Không giảng giải, không ẩn dụ. Không ghi thông tin cá nhân của khách hàng hay người khác.`;

// The Chair asks from his own brain. HOI_BRAIN=nho keeps only _hot and principles, for when a round runs slow.
const HOI_FILES = { day_du: ["_hot.md", "principles.md", "voice.md", "frameworks.md"], nho: ["_hot.md", "principles.md"] };
export function systemHoi() {
  const b = chairBrain(chairSeat(), { files: HOI_FILES[env("HOI_BRAIN")] || HOI_FILES.day_du });
  return b ? `${SYSTEM_HOI}\n\nKIẾN THỨC CỦA CHỦ TOẠ (não dựng từ nguồn công khai của ông; S0xx là mã nguồn):\n\n${b}` : SYSTEM_HOI;
}

const SYSTEM_DE_BAI = `Bạn là thư ký của Hội đồng chuyên gia. Dựa vào vấn đề gốc người hỏi đã chốt, cuộc hỏi đáp và tờ sự thật, soạn đề bài cho hội đồng:
- title: tiêu đề tối đa 60 ký tự.
- phuong_an: 2–4 phương án khác nhau thật sự (không phải biến thể của một ý), id A–D, label ngắn một dòng. Luôn có một phương án "Giữ nguyên như hiện nay".
- chon: số thứ tự (số trong ngoặc vuông [0], [1]…, đếm từ 0) của tối đa 8 mục quan trọng nhất trong tờ sự thật, mục quan trọng nhất trước. Chỉ chọn số thứ tự, không chép lại số liệu. Tờ sự thật trống thì chon rỗng.
Viết tiếng Việt, ngắn. Không ghi thông tin cá nhân của khách hàng hay người khác.`;

const fmtTraLoi = (t) => [t?.chon, t?.tu_go && `tự gõ: ${t.tu_go}`].filter(Boolean).join("; ") || "bỏ trống";
function fmtLuot(l) {
  const tl = new Map((l.tra_loi || []).map((t) => [t.id, t]));
  const qs = l.cau_hoi.map((q) => `- ${q.hoi} [${q.lua_chon.join(" / ")}] → người hỏi: ${tl.has(q.id) ? fmtTraLoi(tl.get(q.id)) : "chưa trả lời"}`);
  return `Lượt ${l.so}:\n${qs.join("\n")}${l.nhan_xet_so ? `\n(Nhận xét số: ${l.nhan_xet_so})` : ""}`;
}
const fmtFacts = (f, so = false) => [
  ...f.su_that.map((s, i) => `${so ? `[${i}]` : "-"} ${s.y}: ${s.so} (${s.nguon}, ${s.ngay})`),
  ...(f.chua_biet.length ? [`Chưa biết: ${f.chua_biet.join("; ")}`] : []),
].join("\n");

function promptLuot(s, cuoi) {
  const facts = s.facts ? fmtFacts(s.facts) : "";
  return [
    `CÂU HỎI GỐC CỦA NGƯỜI HỎI: ${s.cauHoi}`,
    s.tra_loi_ban_dau && `CÂU TRẢ LỜI BAN ĐẦU ĐÃ GHI (tra_loi_ban_dau): ${s.tra_loi_ban_dau}, giữ nguyên trừ khi người hỏi đổi ý.`,
    s.luot.length && `CÁC LƯỢT TRƯỚC:\n${s.luot.map(fmtLuot).join("\n")}`,
    facts && `TỜ SỰ THẬT (đọc từ tài liệu, có nguồn):\n${facts}`,
    cuoi ? `Đã đủ ${MAX_LUOT} lượt hỏi. Không hỏi thêm: cau_hoi để rỗng, chốt một câu vấn đề gốc vào de_xuat_van_de_goc.` : `Đây là lượt ${s.luot.length + 1}/${MAX_LUOT}.`,
  ].filter(Boolean).join("\n\n");
}

const promptDeBai = (s) => [
  `VẤN ĐỀ GỐC${s.bo_qua_vong_hoi ? " (người hỏi chọn bỏ vòng hỏi)" : ""}: ${s.van_de_goc}`,
  `CÂU HỎI BAN ĐẦU: ${s.cauHoi}`,
  `CÂU TRẢ LỜI BAN ĐẦU CỦA ANH: ${s.tra_loi_ban_dau}`,
  s.luot.length && `HỎI ĐÁP:\n${s.luot.map(fmtLuot).join("\n")}`,
  `TỜ SỰ THẬT (đánh số từ 0):\n${fmtFacts(s.facts, true) || "(trống)"}`,
].filter(Boolean).join("\n\n");

const EPERM = /EPERM|Operation not permitted/i;
/** Lý do không đọc được tài liệu: lượt đọc lỗi, hoặc macOS chặn quyền (CLI vẫn xong nhưng không có sự thật nào từ tài liệu,
 * chỉ có thể có số phần mềm vì thư mục số nằm ngoài Documents). Rỗng nếu ổn. */
const docHong = (s) => s.docError || (!s.facts?.su_that?.length && s.facts?.chua_biet?.find((x) => EPERM.test(x))) || "";
/** Cảnh báo trên thẻ đề bài: lỗi đọc tài liệu trước (khi đó số phần mềm cũng chưa được đọc), rồi mới đến lỗi lấy số phần mềm. */
function canhBao(s) {
  const ly = docHong(s);
  if (ly) return cut(`Chưa đọc được tài liệu: ${loiVi(ly, 120)}`, 320);
  return "";
}

// "Doanh thu: 1 tỷ"; a description that already ends a sentence is not followed by another colon
const noiDungSo = ({ y, so }) => (!so ? y || "" : !y ? so : /[.;:!?]$/.test(y.trim()) ? `${y.trim()} ${so}` : `${y}: ${so}`);

/** Đề bài gửi hội đồng ≤ MAX_PROMPT. Số liệu dựng thẳng từ tờ sự thật theo số thứ tự model chọn (≤ 8), nên không lệch chữ, không bịa.
 * Quá dài thì bỏ dần từ cuối: CHƯA BIẾT → VÒNG HỎI → SỐ LIỆU; vấn đề gốc và phương án luôn giữ. */
function buildPrompt(s, db) {
  const hong = Boolean(docHong(s)); // chua_biet then holds the read error, not "what the documents lack"
  const phuongAn = db.phuong_an.slice(0, 4);
  const su = s.facts?.su_that ?? [];
  const chon = [...new Set((db.chon ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < su.length))];
  let sl = (chon.length ? chon : su.map((_, i) => i)).slice(0, 8)
    .map((i) => ({ noi_dung: noiDungSo(su[i]), nguon: su[i].nguon, ngay: su[i].ngay }));
  let vh = s.luot.flatMap((l) => {
    const tl = new Map((l.tra_loi || []).map((t) => [t.id, t]));
    return l.cau_hoi.filter((q) => tl.get(q.id)?.chon || tl.get(q.id)?.tu_go).map((q) => `- ${cut(q.hoi, 160)} → ${cut(fmtTraLoi(tl.get(q.id)), 200)}`);
  });
  let cb = hong ? [] : (s.facts?.chua_biet ?? []).slice(0, 4).map((x) => `- ${cut(x, 160)}`);
  const head = s.bo_qua_vong_hoi ? "người hỏi chọn bỏ vòng hỏi, lấy nguyên câu hỏi ban đầu" : "người hỏi đã chốt qua vòng hỏi tư duy nguyên bản";
  const make = () => [
    `VẤN ĐỀ GỐC (${head}): ${cut(s.van_de_goc, 800)}`,
    `CÂU HỎI BAN ĐẦU: ${cut(s.cauHoi, 800)}`,
    `NẾU PHẢI QUYẾT HÔM NAY, NGƯỜI HỎI CHỌN: ${cut(s.tra_loi_ban_dau, 400)}`,
    ...(vh.length ? ["VÒNG HỎI (rút gọn, hỏi → người hỏi trả lời):", ...vh] : []),
    "SỐ LIỆU THƯ KÝ TRÌNH (nguồn: thư mục tài liệu của người hỏi):",
    ...(sl.length ? sl.map((x) => `- ${cut(x.noi_dung, 400)} (${cut(x.nguon, 120)}${x.ngay ? `, ${cut(x.ngay, 20)}` : ""})`) : [`- chưa có số liệu đã kiểm trong tài liệu${hong ? " (chưa đọc được tài liệu)" : ""}`]),
    ...(cb.length ? ["CHƯA BIẾT (tài liệu không có):", ...cb] : []),
    "PHƯƠNG ÁN:",
    ...phuongAn.map((p) => `${p.id}. ${cut(p.label, 200)}`),
    "Trả lời và viết kết luận bằng tiếng Việt.",
  ].join("\n");
  let prompt = make();
  while (prompt.length > MAX_PROMPT && (cb.length || vh.length || sl.length)) {
    if (cb.length) cb = cb.slice(0, -1); else if (vh.length) vh = vh.slice(0, -1); else sl = sl.slice(0, -1);
    prompt = make();
  }
  return { prompt, so_lieu: sl, phuong_an: phuongAn, chua_biet: hong ? [] : (s.facts?.chua_biet ?? []).slice(0, 4).map((x) => cut(x, 160)) };
}

export function createHoiGoc({ ask, docTaiLieu, saveDir, newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }) {
  const phien = new Map();
  const luu = (s) => {
    const { docPromise, docError, dang, ...rest } = s;
    fs.mkdirSync(saveDir, { recursive: true });
    fs.writeFileSync(path.join(saveDir, `${s.id}.json`), JSON.stringify(rest, null, 2));
  };
  const lay = (id) => {
    const s = phien.get(id);
    if (!s) throw new Error(`Không thấy phiên hỏi ${id}`);
    return s;
  };
  const hoi = (s, cuoi = false) => ask({ model: model(), system: systemHoi(), prompt: promptLuot(s, cuoi), schema: LUOT, effort: env("HOI_EFFORT") || "medium" });
  const themLuot = (s, r) => {
    const l = { so: s.luot.length + 1, cau_hoi: r.cau_hoi, tra_loi: [], nhan_xet_so: r.nhan_xet_so || "" };
    s.luot.push(l);
    return { so: l.so, nhan_xet_so: l.nhan_xet_so, cau_hoi: l.cau_hoi };
  };

  return {
    async start(cauHoi) {
      const s = { id: newId(), loai: "", cauHoi, luot: [], facts: null, deXuat: "", van_de_goc: "", tra_loi_ban_dau: "", bo_qua_vong_hoi: false };
      const r = await hoi(s);
      s.loai = r.loai;
      s.tra_loi_ban_dau = r.tra_loi_ban_dau || "";
      phien.set(s.id, s);
      if (r.loai === "tra_cuu") {
        s.facts = await docTaiLieu({ cauHoi, cheDo: "tra_cuu" });
        luu(s);
        return { id: s.id, loai: "tra_cuu", tra_loi: s.facts.tra_loi_tra_cuu, nguon: s.facts.su_that };
      }
      s.docPromise = Promise.resolve()
        .then(() => docTaiLieu({ cauHoi }))
        .then((f) => { s.facts = f; }, (e) => { s.docError = String(e); })
        .then(() => luu(s))
        .catch(() => {});
      const luot = themLuot(s, r);
      luu(s);
      return { id: s.id, loai: r.loai, luot };
    },

    async answer(id, traLoi) {
      const s = lay(id);
      if (s.dang) throw new Error("Đang xử lý lượt trước, chờ một chút");
      if (s.deXuat) throw new Error("Đã có đề xuất vấn đề gốc, hãy chốt");
      const cuoi = s.luot.at(-1);
      if (!cuoi) throw new Error("Phiên này không có vòng hỏi");
      s.dang = true;
      try {
        cuoi.tra_loi = traLoi;
        const het = s.luot.length >= MAX_LUOT;
        const r = await hoi(s, het);
        if (r.tra_loi_ban_dau && !s.tra_loi_ban_dau) s.tra_loi_ban_dau = r.tra_loi_ban_dau; // chỉ điền khi lượt trước chưa có
        // Hết lượt, hoặc model không hỏi gì mà cũng không đề xuất: chốt luôn để không kẹt ở màn trống.
        const de = r.de_xuat_van_de_goc || (het || !r.cau_hoi.length ? s.cauHoi : "");
        if (de) {
          s.deXuat = de;
          luu(s);
          return { de_xuat_van_de_goc: de, het_luot: het };
        }
        const luot = themLuot(s, r);
        luu(s);
        return { luot };
      } finally {
        s.dang = false;
      }
    },

    /** Chốt vấn đề gốc (bản người hỏi sửa, hoặc đề xuất) và soạn đề bài. boQua: người hỏi bỏ vòng hỏi, lấy nguyên câu hỏi ban đầu. */
    async confirm(id, vanDeGoc, { boQua = false } = {}) {
      const s = lay(id);
      const sua = boQua ? "" : String(vanDeGoc ?? "").trim();
      s.bo_qua_vong_hoi = boQua || (!sua && !s.deXuat);
      s.van_de_goc = boQua ? s.cauHoi : sua || s.deXuat || s.cauHoi;
      await s.docPromise;
      s.facts ||= { su_that: [], chua_biet: [s.docError || "Chưa đọc được tài liệu"], tra_loi_tra_cuu: "" };
      s.tra_loi_ban_dau ||= "chưa nêu";
      const d = await ask({ model: model(), system: SYSTEM_DE_BAI, prompt: promptDeBai(s), schema: DE_BAI, effort: env("DOC_EFFORT") || "xhigh" });
      const canh_bao = canhBao(s);
      const { prompt, so_lieu, phuong_an, chua_biet } = buildPrompt(s, d);
      s.de_bai = { title: cut(d.title, 60), van_de_goc: s.van_de_goc, tra_loi_ban_dau: s.tra_loi_ban_dau, so_lieu, chua_biet, phuong_an, prompt, bo_qua_vong_hoi: s.bo_qua_vong_hoi, canh_bao };
      luu(s);
      return { de_bai: s.de_bai };
    },

    get: (id) => phien.get(id),
  };
}

export const startHoiGocApp = () => createHoiGoc({ ask: askJson, docTaiLieu: docTaiLieuMacDinh, saveDir: env("HOI_GOC_DIR") || path.join(SESSIONS_DIR, "hoi-goc") });
