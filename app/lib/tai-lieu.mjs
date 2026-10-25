import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "./env.mjs";
import { askJson, S } from "./anthropic.mjs";

// Tuỳ chọn: TAI_LIEU_DIR trong .env trỏ tới một thư mục ghi chú của bạn (markdown, văn bản). Có thì
// Chủ toạ đọc nó (chỉ Read/Grep/Glob, không sửa gì) để kiểm câu trả lời bằng số thật; không có thì
// hội đồng vẫn chạy, chỉ là không có tờ sự thật.
export const taiLieuDir = () => {
  const d = env("TAI_LIEU_DIR").trim();
  return d ? path.resolve(d.replace(/^~(?=\/|$)/, os.homedir())) : "";
};
const model = () => env("HOI_MODEL") || "claude-opus-5-5";

const SU_THAT = S.obj({
  su_that: S.arr(S.obj({ y: S.str, so: S.str, nguon: S.str, ngay: S.str })),
  chua_biet: S.arr(S.str),
  tra_loi_tra_cuu: S.str,
});

const system = (dir) => `Bạn là thư ký số liệu của Hội đồng chuyên gia. Thư mục tài liệu của người hỏi: ${dir}.
Chỉ đọc. Bắt đầu bằng Glob để xem thư mục có gì; đọc mục lục, README hoặc index trước nếu có, rồi mới tới trang liên quan. Dùng Grep để tìm, đừng đọc tràn lan.
Ghi tối đa 15 sự thật quan trọng nhất cho câu hỏi: mỗi sự thật có con số (nếu có), nguồn và ngày của số liệu. Nguồn là đường dẫn file tương đối từ thư mục tài liệu. Không bịa số. Không ghi thông tin cá nhân (tên, số điện thoại, mã hồ sơ) của khách hàng hay người khác.
Điều cần mà không tìm thấy thì ghi vào chua_biet. Nếu chế độ là "tra_cuu", viết thêm tra_loi_tra_cuu: 1–3 câu trả lời thẳng, có nguồn; ngược lại để chuỗi rỗng.`;

export const CHUA_NOI = "Hội đồng chưa nối với thư mục tài liệu nào nên không tra được số. Đặt TAI_LIEU_DIR trong .env trỏ tới thư mục ghi chú của bạn, hoặc đưa con số thẳng vào câu hỏi.";

/** Một lượt đọc thư mục tài liệu. Chưa đặt TAI_LIEU_DIR thì trả tờ sự thật rỗng (không gọi model). */
export async function docTaiLieu({ cauHoi, traLoi = [], cheDo = "chien_luoc" }) {
  const dir = taiLieuDir();
  if (!dir) return { su_that: [], chua_biet: [], tra_loi_tra_cuu: cheDo === "tra_cuu" ? CHUA_NOI : "", khong_tai_lieu: true };
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Không thấy thư mục tài liệu TAI_LIEU_DIR: ${dir}`);
  const prompt = [
    `Chế độ: ${cheDo}`,
    `Câu hỏi của người hỏi: ${cauHoi}`,
    traLoi.length && "Người hỏi đã trả lời thêm:\n" + traLoi.map((t) => "- " + t).join("\n"),
  ].filter(Boolean).join("\n");
  return askJson({ model: model(), system: system(dir), prompt, schema: SU_THAT, tools: "Read,Grep,Glob", addDirs: [dir], effort: env("DOC_EFFORT") || "xhigh" });
}
