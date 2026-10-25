import { NHAN } from "./phieu.mjs";

// Họp tiếp: after a verdict the asker adds what was missing and the council sits again on the same
// problem. No new hỏi rounds and no new document read: the brief is the addition, the last
// verdict, then the original brief cut to fit.
export const MAX_PROMPT_TIEP = 6000;
const dong = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const cut = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

/** Where a follow-up starts from: a council in memory or its saved events.json. Councils from
 * before follow-ups existed have no lan / goc_prompt / phieu: those come from prompt and the
 * phieu event. */
export function gocCuaPhien(x) {
  const ev = x.events || [];
  const last = (t) => [...ev].reverse().find((e) => e.type === t);
  return {
    lan: x.lan || 1,
    goc_prompt: x.goc_prompt || x.prompt,
    phieu: x.phieu || last("phieu")?.path || null,
    mode: x.mode === "quick" ? "quick" : "full",
    setup: ev.find((e) => e.type === "setup") || null,
    verdict: last("verdict")?.verdict || null,
    chairView: last("chair_view")?.view || null,
    // every addition so far, oldest first: the earlier ones plus this council's own
    bo_sung_truoc: [...(x.bo_sung_truoc || []), ...(x.bo_sung ? [x.bo_sung] : [])],
  };
}

/** The next meeting number: one past the highest "## Lần họp N" already in the phiếu, so following
 * up an older council in the chain never writes a second "Lần họp 2". Never below the council's own + 1. */
export function lanKeTiep(phieuText, lan) {
  const daCo = [...String(phieuText ?? "").matchAll(/^## Lần họp (\d+)\b/gm)].map((m) => Number(m[1]));
  return Math.max(lan + 1, ...daCo.map((n) => n + 1));
}

const MAX_BO_SUNG_TRUOC = 1000;

/** The brief for meeting `lan` (2, 3, …), at most MAX_PROMPT_TIEP characters. The addition and the
 * last verdict always fit; earlier additions get up to MAX_BO_SUNG_TRUOC, newest first; the original
 * brief gets what is left. */
export function promptHopTiep({ lan, boSung, boSungTruoc = [], verdict, chairView, gocPrompt }) {
  const truoc = [];
  let con = MAX_BO_SUNG_TRUOC;
  for (const b of [...boSungTruoc].reverse()) {
    const d = cut(dong(b), Math.min(400, con - 3));
    if (con - d.length - 3 < 0 || d.length < 2) break;
    truoc.push(`- ${d}`);
    con -= d.length + 3;
  }
  const ketLuan = cut([
    NHAN[verdict.label] || verdict.label,
    dong(verdict.call),
    verdict.conditions?.length && `Điều kiện: ${verdict.conditions.map(dong).join("; ")}`,
    chairView?.nhan_dinh && `Góc nhìn Chủ toạ: ${dong(chairView.nhan_dinh)}`,
  ].filter(Boolean).join(" · "), 1200);
  const head = [
    `HỌP TIẾP LẦN ${lan}. Người hỏi bổ sung sau kết luận lần trước:`,
    cut(String(boSung ?? "").trim(), 2000),
    `KẾT LUẬN LẦN TRƯỚC: ${ketLuan}`,
    "Không hỏi lại từ đầu. Dựng lại phương án nếu phần bổ sung mở ra phương án mới.",
    ...(truoc.length ? ["BỔ SUNG CÁC LẦN TRƯỚC (mới nhất trước):", ...truoc] : []),
    "ĐỀ BÀI GỐC:",
  ].join("\n");
  const tail = "\nTrả lời và viết kết luận bằng tiếng Việt.";
  return `${head}\n${cut(String(gocPrompt ?? "").trim(), MAX_PROMPT_TIEP - head.length - tail.length - 1)}${tail}`;
}
