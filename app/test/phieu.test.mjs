import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { slugVi, ghiPhieu, ghiHopTiep, phieuTrongThuMuc } from "../lib/phieu.mjs";
import * as seatsMod from "../lib/seats.mjs";

const dirMoi = () => fs.mkdtempSync(path.join(os.tmpdir(), "phieu-"));
const hoi = { cauHoi: "Có nên tăng giá khám?", van_de_goc: "Giá thấp hơn chi phí sàn", tra_loi_ban_dau: "Tăng", luot: [{ so: 1, cau_hoi: [{ id: "q1", hoi: "Đo bằng gì?" }], tra_loi: [{ id: "q1", chon: "Doanh thu" }] }], facts: { su_that: [{ y: "Doanh thu", so: "1 tỷ", nguon: "wiki/a.md", ngay: "2026-09" }] } };
const setup = { title: "Tăng giá khám", options: [{ id: "A", label: "Tăng 10%" }, { id: "B", label: "Giữ" }] };
const verdict = { label: "GO WITH CONDITIONS", call: "Tăng 10% cho khách mới.", recommended: "A", confidence: 7, scores: { A: { score: 7.1 }, B: { score: 3 } }, why: [{ seat: "buffett", point: "Biên lãi" }], next_steps: [{ when: "Tuần này", action: "Đổi bảng giá" }], kill_criteria: "Khách giảm 20%" };

test("slugVi bỏ dấu tiếng Việt", () => {
  assert.equal(slugVi("Có nên mở ca tối thứ Bảy? Đặt lịch"), "co-nen-mo-ca-toi-thu-bay-dat-lich");
  assert.ok(slugVi("a".repeat(100)).length <= 60);
});

test("ghiPhieu ghi file và chèn dòng mới lên đầu sổ phiếu", () => {
  const dir = dirMoi();
  fs.writeFileSync(path.join(dir, "00-so-phieu.md"), "# Sổ phiếu chiến lược\n\n| Ngày | Câu hỏi | Kết luận | Hạn xem lại | Trạng thái | File |\n|---|---|---|---|---|---|\n| 2026-10-11 | Cũ | cũ | 2026-11-10 | mo | [file](cu.md) |\n");
  const f = ghiPhieu({ dir, today: "2026-10-25", sessionId: "2026-10-24-abc", hoi, setup, verdict, seats: [] });
  assert.equal(path.basename(f), "2026-10-25-hoi-dong-tang-gia-kham.md");
  const body = fs.readFileSync(f, "utf8");
  assert.match(body, /Giá thấp hơn chi phí sàn/);
  assert.match(body, /LÀM, CÓ ĐIỀU KIỆN/);
  assert.match(body, /wiki\/a\.md/);
  const so = fs.readFileSync(path.join(dir, "00-so-phieu.md"), "utf8").split("\n");
  assert.match(so[4], /^\| 2026-10-25 \| Có nên tăng giá khám\? \|/);
  assert.match(so[4], /\| 2026-11-24 \| mo \| \[file\]\(2026-10-25-hoi-dong-tang-gia-kham\.md\) \|$/);
  assert.match(so[5], /Cũ/);
});

test("ghiPhieu: chưa có sổ phiếu thì tạo sổ mới có dòng phiếu; dấu | trong kết luận đổi thành /", () => {
  const dir = dirMoi();
  const f = ghiPhieu({ dir, today: "2026-10-25", sessionId: "s1", hoi, setup, verdict: { ...verdict, call: "Tăng | giữ " + "x".repeat(300) }, seats: [] });
  assert.ok(fs.existsSync(f));
  assert.deepEqual(fs.readdirSync(dir).sort(), ["00-so-phieu.md", path.basename(f)].sort());
  assert.match(fs.readFileSync(path.join(dir, "00-so-phieu.md"), "utf8"), /^# Sổ phiếu quyết định[\s\S]*\|---\|---\|---\|---\|---\|---\|\n\| 2026-10-25 \|/);
  const dir2 = dirMoi();
  fs.writeFileSync(path.join(dir2, "00-so-phieu.md"), "# Sổ\n\n| Ngày | Câu hỏi | Kết luận | Hạn xem lại | Trạng thái | File |\n|---|---|---|---|---|---|\n");
  ghiPhieu({ dir: dir2, today: "2026-10-25", sessionId: "s1", hoi, setup, verdict: { ...verdict, call: "Tăng | giữ " + "x".repeat(300) }, seats: [] });
  const dong = fs.readFileSync(path.join(dir2, "00-so-phieu.md"), "utf8").split("\n")[4];
  assert.match(dong, /Tăng \/ giữ x+/);
  assert.equal(dong.split(" | ").length, 6);
  assert.ok(dong.length < 330);
});

test("ghiPhieu: bỏ vòng hỏi thì phiếu nói rõ; có vòng hỏi thì ghi 'người hỏi chốt'", () => {
  const dir = dirMoi();
  const bo = fs.readFileSync(ghiPhieu({ dir, today: "2026-10-25", sessionId: "s1", hoi: { ...hoi, bo_qua_vong_hoi: true, luot: [] }, setup, verdict, seats: [] }), "utf8");
  assert.match(bo, /^## Vấn đề gốc \(lấy nguyên câu hỏi — người hỏi bỏ vòng hỏi\)$/m);
  assert.doesNotMatch(bo, /\(người hỏi chốt\)/);
  assert.match(bo, /## Vòng hỏi\n\nNgười hỏi chọn bỏ vòng hỏi\./);
  const co = fs.readFileSync(ghiPhieu({ dir: dirMoi(), today: "2026-10-25", sessionId: "s1", hoi: { ...hoi, bo_qua_vong_hoi: false }, setup, verdict, seats: [] }), "utf8");
  assert.match(co, /^## Vấn đề gốc \(người hỏi chốt\)$/m);
  assert.doesNotMatch(co, /bỏ vòng hỏi/);
  assert.match(co, /Đo bằng gì\? → Doanh thu/);
  const ca = fs.readFileSync(ghiPhieu({ dir: dirMoi(), today: "2026-10-25", sessionId: "s1", hoi: { ...hoi, bo_qua_vong_hoi: true }, setup, verdict, seats: [] }), "utf8");
  assert.match(ca, /Người hỏi chọn bỏ vòng hỏi\.[\s\S]*Đo bằng gì\? → Doanh thu/);
});

test("ghiPhieu: 'Vì sao' hiện tên ghế (không có thì giữ key); mục rỗng thì bỏ tiêu đề", () => {
  const { byKey, loadRoster } = seatsMod;
  loadRoster();
  const ten = byKey.buffett?.short;
  assert.ok(ten, "roster của repo phải có ghế buffett");
  const body = fs.readFileSync(ghiPhieu({ dir: dirMoi(), today: "2026-10-25", sessionId: "s1", hoi, setup, verdict: { ...verdict, why: [{ seat: "buffett", point: "Biên lãi" }, { seat: "khong-co-ghe", point: "Khác" }] }, seats: [] }), "utf8");
  assert.ok(body.includes(`Biên lãi (${ten})`));
  assert.ok(!body.includes("(buffett)"));
  assert.match(body, /Khác \(khong-co-ghe\)/);
  const trong = fs.readFileSync(ghiPhieu({ dir: dirMoi(), today: "2026-10-25", sessionId: "s1", hoi: { ...hoi, facts: null }, setup, verdict: { ...verdict, why: [], next_steps: [] }, seats: [] }), "utf8");
  for (const h of ["## Vì sao", "## Bước tiếp theo", "## Số liệu đã đọc"]) assert.ok(!trong.includes(h), h);
  assert.match(trong, /## Kết luận/);
});

test("ghiPhieu: de_bai.canh_bao (chưa đọc được tài liệu) thành dòng cảnh báo trong 'Số liệu đã đọc', kể cả khi không có số", () => {
  const canh = "Chưa đọc được tài liệu: macOS chưa cho app đọc thư mục Documents — mở Cài đặt hệ thống › Quyền riêng tư › Tệp và thư mục · EPERM";
  const body = fs.readFileSync(ghiPhieu({ dir: dirMoi(), today: "2026-10-25", sessionId: "s1", hoi: { ...hoi, facts: { su_that: [], chua_biet: [] }, de_bai: { canh_bao: canh } }, setup, verdict, seats: [] }), "utf8");
  assert.ok(body.includes(`## Số liệu đã đọc\n\n- **Cảnh báo:** ${canh}\n`));
  const ok = fs.readFileSync(ghiPhieu({ dir: dirMoi(), today: "2026-10-25", sessionId: "s1", hoi: { ...hoi, de_bai: { canh_bao: "" } }, setup, verdict, seats: [] }), "utf8");
  assert.ok(!ok.includes("Cảnh báo"));
});

test("ghiPhieu: mục Góc nhìn Chủ toạ ngay sau Kết luận; không có thì ghi 'Chưa có góc nhìn Chủ toạ'", () => {
  const cv = { dong_y: "không đồng ý", nhan_dinh: "Đừng tăng giá khi chưa đo chi phí sàn.", ly_do: [{ y: "Chưa biết chi phí sàn", khung: "chi phí vật liệu sàn", nguon: "S014" }], bo_buoc: "Bỏ khảo sát giá đối thủ", thu_nhanh: "Đo chi phí sàn 7 ngày" };
  const co = fs.readFileSync(ghiPhieu({ dir: dirMoi(), today: "2026-10-25", sessionId: "s1", hoi, setup, verdict, chairView: cv }), "utf8");
  assert.match(co, /## Kết luận[\s\S]*## Góc nhìn Chủ toạ\n\n\*\*Không đồng ý\.\*\* Đừng tăng giá khi chưa đo chi phí sàn\.\n\n- Chưa biết chi phí sàn \(chi phí vật liệu sàn, S014\)\n- \*\*Nên xoá:\*\* Bỏ khảo sát giá đối thủ\n- \*\*Thử nhanh:\*\* Đo chi phí sàn 7 ngày\n\n## Điểm/);
  const khong = fs.readFileSync(ghiPhieu({ dir: dirMoi(), today: "2026-10-25", sessionId: "s1", hoi, setup, verdict, chairView: null }), "utf8");
  assert.match(khong, /## Góc nhìn Chủ toạ\n\nChưa có góc nhìn Chủ toạ\.\n\n## Điểm/);
});

test("ghiHopTiep nối 'Lần họp n' vào cuối phiếu và sửa đúng một dòng sổ", () => {
  const dir = dirMoi();
  const so0 = "# Sổ\n\n| Ngày | Câu hỏi | Kết luận | Hạn xem lại | Trạng thái | File |\n|---|---|---|---|---|---|\n| 2026-10-24 | Khác | khác | 2026-11-23 | mo | [file](khac.md) |\n";
  fs.writeFileSync(path.join(dir, "00-so-phieu.md"), so0);
  const f = ghiPhieu({ dir, today: "2026-10-25", sessionId: "s1", hoi, setup, verdict, chairView: null });
  const truoc = fs.readFileSync(f, "utf8");
  const v2 = { ...verdict, label: "RESHAPE", call: "Chỉ tăng ca tối.", recommended: "B", conditions: ["Ca tối kín 85%"] };
  ghiHopTiep({ dir, file: f, lan: 2, boSung: "Ca tối đã kín 90%.", setup, verdict: v2, chairView: { dong_y: "đồng ý", nhan_dinh: "Hợp lý.", ly_do: [], bo_buoc: "", thu_nhanh: "" }, today: "2026-11-02" });
  const sau = fs.readFileSync(f, "utf8");
  assert.ok(sau.startsWith(truoc));
  assert.match(sau.slice(truoc.length), /^\n## Lần họp 2 \(2026-11-02\)\n\n\*\*Bổ sung:\*\* Ca tối đã kín 90%\.\n\n\*\*Kết luận:\*\* ĐIỀU CHỈNH · Chỉ tăng ca tối\. \(phương án B: Giữ\)\n/);
  assert.match(sau, /\*\*Điều kiện:\*\*\n- Ca tối kín 85%/);
  assert.match(sau, /\*\*Dừng nếu:\*\* Khách giảm 20%/);
  assert.match(sau, /\*\*Góc nhìn Chủ toạ:\*\* Đồng ý\. Hợp lý\./);
  const so = fs.readFileSync(path.join(dir, "00-so-phieu.md"), "utf8").split("\n");
  const moi = so.find((l) => l.includes(`(${path.basename(f)})`));
  assert.match(moi, /^\| 2026-10-25 \| Có nên tăng giá khám\? \| \(họp lần 2 02\/11\) Chỉ tăng ca tối\. \| 2026-12-02 \| mo \| \[file\]/);
  assert.ok(so.includes("| 2026-10-24 | Khác | khác | 2026-11-23 | mo | [file](khac.md) |"));
  assert.equal(so.length, so0.split("\n").length + 1);
});

test("ghiHopTiep: không có sổ thì chỉ nối vào file; không có góc nhìn thì ghi rõ", () => {
  const dir = dirMoi();
  const f = ghiPhieu({ dir, today: "2026-10-25", sessionId: "s1", hoi, setup, verdict, chairView: null });
  fs.rmSync(path.join(dir, "00-so-phieu.md")); // the user removed their sổ
  ghiHopTiep({ dir, file: f, lan: 2, boSung: "Thêm số", setup, verdict, chairView: null, today: "2026-10-26" });
  assert.deepEqual(fs.readdirSync(dir), [path.basename(f)]);
  assert.match(fs.readFileSync(f, "utf8"), /## Lần họp 2 \(2026-10-26\)[\s\S]*\*\*Góc nhìn Chủ toạ:\*\* Chưa có góc nhìn Chủ toạ\./);
});

test("phieuTrongThuMuc: chỉ nhận file .md có thật nằm ngay trong thư mục phiếu", () => {
  const dir = dirMoi(), khac = dirMoi();
  const f = ghiPhieu({ dir, today: "2026-10-25", sessionId: "s1", hoi, setup, verdict, chairView: null });
  assert.equal(phieuTrongThuMuc(dir, f), f);
  const ngoai = ghiPhieu({ dir: khac, today: "2026-10-25", sessionId: "s1", hoi, setup, verdict, chairView: null });
  assert.throws(() => phieuTrongThuMuc(dir, ngoai), /ngoài thư mục phiếu/);
  assert.throws(() => phieuTrongThuMuc(dir, path.join(dir, "..", "x.md")), /ngoài thư mục phiếu/);
  assert.throws(() => phieuTrongThuMuc(dir, path.join(dir, "khong-co.md")), /không còn/);
  fs.writeFileSync(path.join(dir, "a.txt"), "x");
  assert.throws(() => phieuTrongThuMuc(dir, path.join(dir, "a.txt")), /ngoài thư mục phiếu/);
});

test("câu trích chưa khớp nguyên văn được ghi chú trong phiếu (lần đầu và họp tiếp); ghiHopTiep báo sổ có đổi không", () => {
  const q = "this sentence is not anywhere in the brain at all";
  const cv = { dong_y: "đồng ý", nhan_dinh: `Tôi nói "${q}" (S014)`, ly_do: [{ y: "Lý do sạch", khung: "k", nguon: "S014" }], bo_buoc: "", thu_nhanh: "" };
  const quotes = [{ quote: q, source: "S014", verified: false }];
  const dir = dirMoi();
  const f = ghiPhieu({ dir, today: "2026-10-25", sessionId: "s1", hoi, setup, verdict, chairView: cv, chairQuotes: quotes });
  assert.match(fs.readFileSync(f, "utf8"), /\(S014\) _\(câu trích chưa khớp nguyên văn\)_/);
  assert.doesNotMatch(fs.readFileSync(f, "utf8"), /Lý do sạch[^\n]*chưa khớp/);
  const r = ghiHopTiep({ dir, file: f, lan: 2, boSung: "Thêm", setup, verdict, chairView: cv, quotes, today: "2026-10-26" });
  assert.deepEqual(r, { file: f, so: true });
  assert.match(fs.readFileSync(f, "utf8"), /## Lần họp 2[\s\S]*Góc nhìn Chủ toạ:\*\*[^\n]*_\(câu trích chưa khớp nguyên văn\)_/);
});

test("ghiPhieu: mục Số dùng trong kết luận có nhãn nguồn; giả định và số chưa có nguồn (kể cả của Chủ toạ) tách riêng", () => {
  const ks = { so_lieu: [
    { so: "1,70 tỷ", y: "doanh thu T10", loai: "số liệu", nguon: "ban-hang/t10.csv", trang_thai: "co_nguon" },
    { so: "30%", y: "tỷ lệ khách quay lại", loai: "giả định", nguon: "đếm 2 tuần đầu T11", trang_thai: "gia_dinh" },
    { so: "45 đơn", y: "đơn mỗi ngày", loai: "số liệu", nguon: "ghi-chu/x.md", trang_thai: "khong_thay" },
  ], chua_nguon: [{ so: "12,5%", doan: "Ngành thường đạt 12,5% chuyển đổi" }], gia_dinh: [{ so: "30%", y: "tỷ lệ khách quay lại", loai: "giả định", nguon: "đếm 2 tuần đầu T11" }] };
  const body = fs.readFileSync(ghiPhieu({ dir: dirMoi(), today: "2026-10-25", sessionId: "s1", hoi, setup, verdict: { ...verdict, kiem_so: ks }, chairView: null, chairKiemSo: { so_lieu: [], chua_nguon: [{ so: "35%", doan: "ngành 35% quay lại" }], gia_dinh: [] } }), "utf8");
  assert.match(body, /## Số dùng trong kết luận\n\n- \*\*1,70 tỷ\*\*: doanh thu T10 \(số liệu: ban-hang\/t10\.csv\)\n- \*\*30%\*\*: tỷ lệ khách quay lại \(giả định: đếm 2 tuần đầu T11\)\n- \*\*45 đơn\*\*: đơn mỗi ngày \(số liệu: ghi-chu\/x\.md\) _\(không thấy trong số liệu\)_/);
  assert.match(body, /## Giả định cần kiểm\n\n- \*\*30%\*\*: tỷ lệ khách quay lại\. Kiểm: đếm 2 tuần đầu T11/);
  assert.match(body, /## Số chưa có nguồn\n\n- \*\*12,5%\*\*: …?Ngành thường đạt 12,5% chuyển đổi\n- \*\*35%\*\* \(Góc nhìn Chủ toạ\): ngành 35% quay lại/);
  const sach = fs.readFileSync(ghiPhieu({ dir: dirMoi(), today: "2026-10-25", sessionId: "s1", hoi, setup, verdict: { ...verdict, kiem_so: { so_lieu: [], chua_nguon: [], gia_dinh: [] } }, chairView: null }), "utf8");
  assert.ok(!sach.includes("## Số chưa có nguồn"));
  assert.ok(!sach.includes("## Giả định cần kiểm"));
});

test("ghiHopTiep: lần họp sau cũng ghi giả định cần kiểm và số chưa có nguồn (kể cả của Chủ toạ)", () => {
  const dir = dirMoi();
  const f = ghiPhieu({ dir, today: "2026-10-25", sessionId: "s1", hoi, setup, verdict, chairView: null });
  const ks = { so_lieu: [], chua_nguon: [{ so: "12,5%", doan: "Ngành thường đạt 12,5%" }], gia_dinh: [{ so: "30%", y: "tỷ lệ khách quay lại", loai: "giả định", nguon: "đếm 2 tuần" }] };
  ghiHopTiep({ dir, file: f, lan: 2, boSung: "Thêm số", setup, verdict: { ...verdict, kiem_so: ks }, chairView: null, chairKiemSo: { chua_nguon: [{ so: "35%", doan: "35% quay lại" }] }, today: "2026-10-26" });
  const lan2 = fs.readFileSync(f, "utf8").split("## Lần họp 2")[1];
  assert.match(lan2, /\*\*Giả định cần kiểm:\*\* 30% \(tỷ lệ khách quay lại\)/);
  assert.match(lan2, /\*\*Số chưa có nguồn:\*\* 12,5%, 35% \(Góc nhìn Chủ toạ\)/);
});
