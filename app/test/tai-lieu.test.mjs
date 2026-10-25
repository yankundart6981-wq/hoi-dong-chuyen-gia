import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hd-test-"));
const dir = path.join(tmp, "ghi-chu");
fs.mkdirSync(dir, { recursive: true });
process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-token";
process.env.CLAUDE_BIN = new URL("./fake-claude.mjs", import.meta.url).pathname;
process.env.FAKE_CLAUDE_LOG = path.join(tmp, "log.jsonl");
process.env.FAKE_CLAUDE_REPLY = path.join(tmp, "reply.json");
delete process.env.DOC_EFFORT;
fs.writeFileSync(process.env.FAKE_CLAUDE_REPLY, JSON.stringify({ su_that: [{ y: "Doanh thu T9", so: "1,2 tỷ", nguon: "bao-cao.md", ngay: "2026-09-30" }], chua_biet: [], tra_loi_tra_cuu: "" }));
const { docTaiLieu, taiLieuDir, CHUA_NOI } = await import("../lib/tai-lieu.mjs");
const lastCall = () => JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_LOG, "utf8").trim().split("\n").at(-1));

test("chưa đặt TAI_LIEU_DIR: tờ sự thật rỗng, không gọi model; câu tra cứu nói rõ là chưa nối tài liệu", async () => {
  delete process.env.TAI_LIEU_DIR;
  assert.equal(taiLieuDir(), "");
  const r = await docTaiLieu({ cauHoi: "Có nên mở ca tối?" });
  assert.deepEqual([r.su_that, r.chua_biet, r.tra_loi_tra_cuu, r.khong_tai_lieu], [[], [], "", true]);
  assert.equal((await docTaiLieu({ cauHoi: "Doanh thu T9?", cheDo: "tra_cuu" })).tra_loi_tra_cuu, CHUA_NOI);
  assert.ok(!fs.existsSync(process.env.FAKE_CLAUDE_LOG), "không gọi model");
});

test("có TAI_LIEU_DIR: chỉ Read/Grep/Glob, add-dir đúng một thư mục đó", async () => {
  process.env.TAI_LIEU_DIR = dir;
  try {
    const r = await docTaiLieu({ cauHoi: "Có nên mở ca tối?" });
    assert.equal(r.su_that[0].so, "1,2 tỷ");
    const { args, token, apiKey, input } = lastCall();
    assert.equal(token, true); assert.equal(apiKey, false);
    assert.equal(args[args.indexOf("--tools") + 1], "Read,Grep,Glob");
    assert.ok(!args.includes("--allowedTools"));
    assert.deepEqual(args.flatMap((a, i) => (a === "--add-dir" ? [args[i + 1]] : [])), [dir]);
    assert.ok(args[args.indexOf("--system-prompt") + 1].includes(dir));
    assert.ok(!args.join(" ").match(/\b(Write|Edit|Bash)\b/));
    assert.equal(args[args.indexOf("--effort") + 1], "xhigh");
    assert.match(input, /Câu hỏi của người hỏi: Có nên mở ca tối\?/);
  } finally { delete process.env.TAI_LIEU_DIR; }
});

test("TAI_LIEU_DIR trỏ tới thư mục không có: báo lỗi rõ", async () => {
  process.env.TAI_LIEU_DIR = path.join(tmp, "khong-co");
  try { await assert.rejects(docTaiLieu({ cauHoi: "x" }), /Không thấy thư mục tài liệu/); } finally { delete process.env.TAI_LIEU_DIR; }
});
