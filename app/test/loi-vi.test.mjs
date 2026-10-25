import { test } from "node:test";
import assert from "node:assert/strict";
import { loiVi } from "../public/loi-vi.js";

test("loiVi: lỗi CLI tiếng Anh hay gặp ra tiếng Việt, giữ chuỗi gốc cắt ngắn sau ·", () => {
  assert.match(loiVi("Error: Claude Code: Claude AI usage limit reached|1761400000"), /^Gói Claude đã chạm hạn mức, thử lại sau · Claude Code: Claude AI usage limit/);
  assert.match(loiVi("Anthropic 429: rate_limit_error"), /^Gói Claude đã chạm hạn mức/);
  assert.match(loiVi("claude CLI exited 1: OAuth token has expired"), /^Token Claude hết hạn hoặc sai — chạy lại claude setup-token và dán vào \.env · /);
  assert.match(loiVi("Claude Code: Invalid API key · Please run /login"), /^Token Claude hết hạn/);
  assert.match(loiVi("Anthropic 400: Your credit balance is too low"), /^Tài khoản API hết credit · /);
  assert.match(loiVi("EPERM: operation not permitted, scandir"), /^macOS chưa cho app đọc thư mục Documents/);
  assert.equal(loiVi("Không thấy phiên hỏi abc"), "Không thấy phiên hỏi abc");
  assert.ok(loiVi("usage limit " + "x".repeat(500)).length < 260);
});
