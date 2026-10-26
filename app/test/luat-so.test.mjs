import { test } from "node:test";
import assert from "node:assert/strict";
const { LUAT_SO, soTrong, kiemSo } = await import("../lib/luat-so.mjs");

test("LUAT_SO nói rõ ba nguồn được phép, cấm số ngành, nhãn Chưa có số và GIẢ ĐỊNH", () => {
  for (const s of ["SỐ LIỆU", "industry", "Chưa có số", "GIẢ ĐỊNH", "÷", "documents folder"]) assert.ok(LUAT_SO.includes(s), s);
});

test("soTrong đọc số kiểu Việt Nam, bỏ ngày tháng, giờ, mã nguồn, số đếm một chữ số", () => {
  const v = soTrong("Doanh thu 1.698.960.000 đồng (1,70 tỷ), 1.096 đơn, 5,6 đơn/giờ, tăng 20%, 1,258 khách, 68 tr/ngày. Hạn 28/10, 2026-11-16, lúc 10:50, T11, tháng 9, S014, gọi 2 người, 2026, thử 14 ngày, giao chậm 7,1 ngày.");
  const gt = v.map((x) => Math.round(x.value * 100) / 100);
  assert.deepEqual(gt, [1698960000, 1700000000, 1096, 5.6, 20, 1258, 68000000, 7.1]);
  assert.equal(v[4].pct, true);
});

test("kiemSo: số trong đề bài/số liệu qua; số tính có phép tính từ số đã có qua; giả định được kê; số bịa bị gắn cờ", () => {
  const dauVao = "SỐ LIỆU:\n- Doanh thu T10: 1.698.960.000 (ban-hang/t10.csv)\n- Đơn T10: 1.096 đơn\nMục tiêu tăng 20%.";
  const soLieu = [
    { so: "1,70 tỷ", y: "doanh thu T10", loai: "số liệu", nguon: "ban-hang/t10.csv" },
    { so: "1,55 triệu", y: "doanh thu mỗi đơn", loai: "tính", nguon: "1.698.960.000 ÷ 1.096 đơn" },
    { so: "30%", y: "tỷ lệ khách quay lại", loai: "giả định", nguon: "đếm 2 tuần đầu tháng 11" },
    { so: "45 đơn", y: "đơn mỗi ngày", loai: "số liệu", nguon: "ghi-chu/x.md" },
  ];
  const vanBan = "Tăng 20% cần thêm 1,55 triệu mỗi đơn trên nền 1,70 tỷ. Giả định khách quay lại 30%. Ngành thường đạt 12,5% chuyển đổi, cần 45 đơn mỗi ngày.";
  const r = kiemSo({ dauVao, soLieu, cacBan: [7.6], vanBan });
  const tt = Object.fromEntries(r.so_lieu.map((x) => [x.so, x.trang_thai]));
  assert.deepEqual(tt, { "1,70 tỷ": "co_nguon", "1,55 triệu": "co_nguon", "30%": "gia_dinh", "45 đơn": "khong_thay" });
  assert.deepEqual(r.chua_nguon.map((x) => x.so), ["12,5%", "45"]);
  assert.match(r.chua_nguon[0].doan, /Ngành thường đạt 12,5%/);
  assert.deepEqual(r.gia_dinh.map((x) => x.so), ["30%"]);
});

test("kiemSo: phép tính dùng số không có nguồn thì không được tính là có nguồn", () => {
  const r = kiemSo({ dauVao: "Doanh thu 1.000.000.000", soLieu: [{ so: "2 triệu", y: "x", loai: "tính", nguon: "1.000.000.000 ÷ 500 khách" }], vanBan: "mỗi khách 2 triệu" });
  assert.equal(r.so_lieu[0].trang_thai, "khong_thay");
  assert.deepEqual(r.chua_nguon.map((x) => x.so), ["2 triệu"]);
});

test("kiemSo: điểm do app tính (cacBan) và số làm tròn trong 2% được coi là có nguồn", () => {
  const r = kiemSo({ dauVao: "Doanh thu 1.698.960.000", cacBan: [7.1, 3], vanBan: "Phương án A được 7,1 điểm, doanh thu khoảng 1,7 tỷ." });
  assert.deepEqual(r.chua_nguon, []);
});

test("kiemSo: phép tính nhiều bước (kết quả trung gian sau ≈/=), số đếm một chữ số và số tuần kê là số liệu vẫn được nhận", () => {
  const dauVao = "SỐ LIỆU THƯ KÝ TRÌNH:\n- Chi quảng cáo mỗi đơn T7 ≈106 nghìn · T10 ≈926 nghìn\n- Khách hỏi T7 747, mua 75 · T10 7/199\n- 77% khách mua lần đầu trong ≤ 8 tuần, mùa cao điểm 9–12 tuần\n- Doanh thu T9 2.414,3 tr";
  const soLieu = [
    { so: "7", y: "đơn T10", loai: "số liệu", nguon: "ban-hang/t10.csv" },
    { so: "8 tuần", y: "thời gian tới đơn đầu", loai: "số liệu", nguon: "ghi-chu/khach.md" },
    { so: "9–12 tuần", y: "mùa cao điểm", loai: "số liệu", nguon: "ghi-chu/khach.md" },
    { so: "≈10,6 nghìn", y: "chi mỗi khách hỏi T7", loai: "tính", nguon: "106 nghìn × 75 ≈ 7,95 tr; 7,95 tr ÷ 747 ≈ 10,6 nghìn" },
    { so: "≈ 6,5 tr", y: "chi T10", loai: "tính", nguon: "926 nghìn/đơn × 7 đơn ≈ 6,48 tr" },
    { so: "≈ 0,27%", y: "chi so với doanh thu", loai: "tính", nguon: "6,48 tr ÷ 2.414,3 tr ≈ 0,27%" },
    { so: "40 nghìn", y: "bịa", loai: "tính", nguon: "120 nghìn ÷ 3 = 40 nghìn" },
  ];
  const vanBan = "Chi mỗi khách hỏi tăng từ ≈10,6 nghìn ở T7. Chi T10 ≈ 6,5 tr, bằng ≈ 0,27% doanh thu. Mỗi đơn 40 nghìn.";
  const r = kiemSo({ dauVao, soLieu, vanBan });
  assert.deepEqual(r.so_lieu.map((e) => e.trang_thai), ["co_nguon", "co_nguon", "co_nguon", "co_nguon", "co_nguon", "co_nguon", "khong_thay"]);
  assert.deepEqual(r.chua_nguon.map((x) => x.so), ["40 nghìn"]);
});

test("kiemSo: số ngày tính từ một ngày dd/mm là có nguồn ('207 đơn trong 26 ngày, 55,7 đơn/tuần')", () => {
  const dauVao = "SỐ LIỆU THƯ KÝ TRÌNH (nguồn: thư mục tài liệu của bạn):\n- Đơn T10 (tới 26/10): 207 (ban-hang/t10.csv, 26/10)";
  const soLieu = [
    { so: "207", y: "đơn T10", loai: "số liệu", nguon: "ban-hang/t10.csv" },
    { so: "26 ngày", y: "số ngày T10 đã qua", loai: "tính", nguon: "tới 26/10" },
    { so: "55,7", y: "đơn mỗi tuần", loai: "tính", nguon: "207 ÷ 26 × 7" },
  ];
  const r = kiemSo({ dauVao, soLieu, vanBan: "207 đơn trong 26 ngày, 55,7 đơn/tuần (207 ÷ 26 × 7)." });
  assert.deepEqual(r.so_lieu.map((x) => x.trang_thai), ["co_nguon", "co_nguon", "co_nguon"]);
  assert.deepEqual(r.chua_nguon, []);
  // 30 ngày một tháng là toán hạng được, không phải số liệu tự do: "30 khách" bịa vẫn bị gắn cờ
  const r2 = kiemSo({ dauVao, soLieu: [{ so: "238,8", y: "đơn cả tháng", loai: "tính", nguon: "207 ÷ 26 × 30" }], vanBan: "Cả tháng khoảng 238,8 đơn, cần thêm 30 khách." });
  assert.equal(r2.so_lieu[0].trang_thai, "co_nguon");
  assert.deepEqual(r2.chua_nguon.map((x) => x.so), ["30"]);
});

test("kiemSo: ngày trong tháng chỉ là toán hạng: số bịa trùng ngày trong đầu vào vẫn bị gắn cờ; phép tính chỉ từ hằng lịch không có nguồn", () => {
  // một dòng tờ số liệu có ngày dd/mm: ngày đó không được thành nguồn tự do cho mọi số bằng nó
  const dauVao = "- Hạn chốt 31/12. Đơn T10 (tới 26/10): 207 (ban-hang/t10.csv, 26/10)";
  const r = kiemSo({ dauVao, soLieu: [], vanBan: "Cần thêm 26 đơn và 31 nhân viên, tăng 26%." });
  assert.deepEqual(r.chua_nguon.map((x) => x.so), ["26", "31", "26%"]);
  const r2 = kiemSo({ dauVao, soLieu: [{ so: "217", y: "x", loai: "tính", nguon: "31 × 7 = 217" }], vanBan: "khoảng 217" });
  assert.equal(r2.so_lieu[0].trang_thai, "khong_thay");
});
