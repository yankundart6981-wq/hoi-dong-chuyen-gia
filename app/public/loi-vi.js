// Lỗi tiếng Anh hay gặp từ Claude CLI/API/macOS → câu tiếng Việt; chuỗi gốc (cắt ngắn) giữ sau "·" để chẩn đoán.
// Dùng chung cho trang (app.js) và server (hoi-goc.mjs).
const MAU = [
  [/EPERM|Operation not permitted/i, "macOS chưa cho app đọc thư mục Documents — mở Cài đặt hệ thống › Quyền riêng tư › Tệp và thư mục"],
  [/credit balance/i, "Tài khoản API hết credit"],
  [/usage limit|rate.?limit|hit your (usage )?limit|limit reached|\b429\b/i, "Gói Claude đã chạm hạn mức, thử lại sau"],
  [/oauth|authenticat|\b401\b|invalid api key|please run \/login/i, "Token Claude hết hạn hoặc sai — chạy lại claude setup-token và dán vào .env"],
];

export function loiVi(msg, n = 140) {
  const s = String(msg ?? "").replace(/^Error:\s*/, "").trim();
  const hit = MAU.find(([re]) => re.test(s));
  return hit ? `${hit[1]} · ${s.length > n ? s.slice(0, n - 1) + "…" : s}` : s;
}
