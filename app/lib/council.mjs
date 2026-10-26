import fs from "node:fs";
import path from "node:path";
import { SEATS, BOARD, byKey, systemFor, parseCard, checkQuotes, defaultBoard, loadRoster, chairSeat } from "./seats.mjs";
import * as ai from "./anthropic.mjs";
import { S } from "./anthropic.mjs";
import { SESSIONS_DIR, env } from "./env.mjs";
import { LUAT_SO, kiemSo } from "./luat-so.mjs";

export const MODELS = {
  seat: env("SEAT_MODEL") || "claude-sonnet-5-5",
  chair: env("CHAIR_MODEL") || "claude-opus-5-5",
};

// The Chair runs the room and never takes a seat at the table.
export { chairSeat };
export const tableBoard = (pick, seatKeys, defaults, chair) => (pick ? seatKeys : defaults).filter((k) => k !== chair);

// The board comes from the roster: the saved default board, or every seat it lists.
const chairSystem = (st) => {
  const seats = st.board.map((k) => byKey[k]);
  return `You are the Chair of a Hội đồng chuyên gia council: ${seats.length} simulated advisors built from the public work of ${seats.map((x) => `${x.name} (${x.pillar.toLowerCase()})`).join(", ")}.
You never argue a side and never add your own pillar. You run the room, keep score, and write in plain English: short sentences, no em dashes, no hype, no tee-ups like "here's the thing", no filler. Seat keys (for key fields only): ${seats.map((x) => x.key).join(", ")}. Whenever you write a seat's name in prose or in a seat field, use its display name: ${seats.map((x) => x.short).join(", ")}. Viết mọi chữ hiển thị (title, decision, brief, options, verdict) bằng tiếng Việt khi câu hỏi bằng tiếng Việt.`;
};

export const DISCLAIMER = "Simulated advisors built from each person's public work. They are not the people and do not speak for them.";

// ---------------------------------------------------------------- sessions
const sessions = new Map();
export const getSession = (id) => sessions.get(id);

function slugify(t) {
  return (t || "council").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "council";
}

// A follow-up council (họp tiếp) also carries parent, lan, goc_prompt, phieu, bo_sung and
// bo_sung_truoc: the council it follows, which meeting this is, the first brief, the phiếu every
// meeting writes into, this meeting's addition and the earlier ones.
const LINK = ["parent", "lan", "goc_prompt", "phieu", "bo_sung", "bo_sung_truoc"];
function newSession(prompt, mode, extra = {}) {
  const id = `${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
  const s = { id, prompt, mode, status: "running", events: [], subs: new Set(), started: Date.now(), state: {} };
  for (const k of LINK) if (extra[k] != null) s[k] = extra[k];
  sessions.set(id, s);
  return s;
}

function emit(s, type, data = {}) {
  const ev = { type, t: Date.now() - s.started, ...data };
  // text deltas are streamed live but not stored one by one; the final card is stored
  if (type !== "delta") s.events.push(ev);
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of s.subs) res.write(line);
}

export function subscribe(s, res) {
  for (const ev of s.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  if (s.status !== "running") { res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`); return; }
  s.subs.add(res);
  res.on("close", () => s.subs.delete(res));
}

// ---------------------------------------------------------------- prompts
function briefBlock(st) {
  const opts = st.options.map((o) => `(${o.id}) ${o.label}`).join("\n");
  const goc = st.prompt ? `\n\nTHE FOUNDER'S BRIEF, VERBATIM, WITH THE SECRETARY'S SỐ LIỆU SHEET (the only source of numbers about this business):\n"""${st.prompt}"""` : "";
  return `THE DECISION: ${st.decision}\n\nOPTIONS:\n${opts}\n\n${st.brief}\n\nAssumptions the Chair made (marked as assumed; challenge them if they matter):\n${st.assumptions.map((a) => `- ${a}`).join("\n")}${goc}`;
}
const optLine = (st) => st.options.map((o) => `${o.id} n/10`).join(" · ");

function round1Prompt(st, seat) {
  const w = st.weights[seat.key];
  return `HỘI ĐỒNG CHUYÊN GIA COUNCIL, ROUND 1 OF 3: OPENING POSITION

You hold the ${seat.short.toUpperCase()} seat (${seat.pillar}).

THE BRIEF
${briefBlock(st)}

Your weight on this decision: ${w.weight}/3 (${w.reason}).

Answer in your seat's voice, first person, plain text, under 300 words, in exactly this shape:

SEAT: ${seat.short.toUpperCase()} (${seat.pillar})
STANCE: Strong yes | Yes | Conditional yes | No | Strong no   (on the option you recommend)
OPTION SCORES: ${optLine(st)}
PILLAR SCORE: n/10   (${seat.dimension}: the option you recommend, judged on your pillar alone)
CONFIDENCE: n/5
RUIN RISK: none | possible | likely
DOOR: one-way | two-way

THE CALL: one sentence, naming the option or a variant.
WHY:
1. argument, naming the framework or principle you used and its source id, e.g. (Value Equation, S014)
2. ...
3. ...
THE RISK I SEE: the single biggest thing that goes wrong.
WHAT WOULD CHANGE MY MIND: a concrete fact or number.
WHAT I'D DO THIS WEEK: one action.
QUESTION FOR THE FOUNDER: the one question you would ask before signing off.

Rules: argue from your pillar first. Quote only verbatim lines from your brain, with the source id. Do not hedge to sound balanced; the Chair balances the council.

${LUAT_SO}`;
}

function cardsBlock(st, round) {
  return st.seats.map((k) => `### ${byKey[k].short} (weight ${st.weights[k].weight})\n${st.cards[round][k]?.text || "(no card)"}`).join("\n\n");
}

function round2Prompt(st, seat) {
  const cr = st.cruxes.map((c, i) => `${i + 1}. ${c.question} (${c.sides.map((x) => `${x.position}: ${x.seats.map((k) => byKey[k]?.short || k).join(", ")}`).join("; ")})`).join("\n");
  const push = st.pressure?.[seat.key] ? `\nFor you specifically: ${st.pressure[seat.key]}\n` : "";
  return `HỘI ĐỒNG CHUYÊN GIA COUNCIL, ROUND 2 OF 3: DEBATE

You hold the ${seat.short.toUpperCase()} seat.

THE BRIEF
${briefBlock(st)}

ROUND 1, EVERY SEAT'S CARD
${cardsBlock(st, 1)}

THE CRUXES THE CHAIR SEES
${cr}
${push}
Answer in your seat's voice, first person, plain text, under 280 words, in exactly this shape:

SEAT: ${seat.short.toUpperCase()}
I DISAGREE MOST WITH: [seat name]. Their argument, in one line, then your rebuttal using your frameworks.
I CONCEDE: the strongest point another seat made against you, and what it changes. "Nothing" only if you can say why their best point fails.
ON THE CRUXES: your answer to each crux, one or two lines each.
STANCE: ...
OPTION SCORES: ${optLine(st)}
PILLAR SCORE: n/10
CONFIDENCE: n/5
RUIN RISK: none | possible | likely
MOVED: no | yes, from X to Y, because ...
MY CONDITIONS FOR YES: up to three, concrete and checkable (a number, a date, a test result).

Rules: engage the actual arguments on the table. Move only for a better argument, never to be agreeable. If everyone agrees with you, attack the weakest part of your own case. A rebuttal built on a number with no source loses to one built on a sourced number.

${LUAT_SO}`;
}

function round3Prompt(st, seat) {
  const d = st.draft;
  return `HỘI ĐỒNG CHUYÊN GIA COUNCIL, ROUND 3 OF 3: VOTE ON THE DRAFT RESOLUTION

You hold the ${seat.short.toUpperCase()} seat.

THE BRIEF
${briefBlock(st)}

YOUR ROUND 2 CARD
${st.cards[2][seat.key]?.text || ""}

THE CHAIR'S DRAFT RESOLUTION
Recommendation: ${d.label} on option ${d.option}. ${d.recommendation}
Conditions:
${d.conditions.map((c) => `- ${c}`).join("\n")}
Next steps:
${d.next_steps.map((c) => `- ${c}`).join("\n")}
Cheapest test: ${d.cheapest_test}
Kill criteria: ${d.kill_criteria}

Answer in your seat's voice, first person, under 140 words, in exactly this shape:

SEAT: ${seat.short.toUpperCase()}
VOTE: Endorse | Endorse with amendment | Dissent
OPTION SCORES: ${optLine(st)}   (given the resolution's conditions)
FINAL SCORE: n/10   (your support for the draft resolution as written)
FINAL PILLAR SCORE: n/10
AMENDMENT OR DISSENT: one or two sentences. Blank if you endorse.
ONE LINE FOR THE FOUNDER: the thing from your pillar they must not forget.

${LUAT_SO}`;
}

// ---------------------------------------------------------------- scoring
export function optionScores(st, round) {
  const out = {};
  for (const o of st.options) {
    let num = 0, den = 0;
    const parts = [];
    for (const k of st.seats) {
      const v = st.cards[round][k]?.parsed.optionScores[o.id];
      const w = st.weights[k].weight;
      if (typeof v === "number") { num += w * v; den += w; parts.push(`${w}x${v}`); }
    }
    out[o.id] = { score: den ? Math.round((num / den) * 10) / 10 : null, math: den ? `(${parts.join(" + ")}) / ${den}` : "" };
  }
  return out;
}

function bandFor(score) {
  if (score == null) return "RESHAPE";
  if (score >= 7.5) return "GO";
  if (score >= 6) return "GO WITH CONDITIONS";
  if (score >= 4.5) return "RESHAPE";
  return "DON'T DO IT";
}

// ---------------------------------------------------------------- chair calls
async function chairSetup(st) {
  const schema = S.obj({
    title: S.str,
    decision: S.str,
    brief: S.str,
    options: S.arr(S.obj({ id: S.enum("A", "B", "C", "D"), label: S.str })),
    assumptions: S.arr(S.str),
    weights: S.arr(S.obj({ seat: S.enum(...st.board), weight: S.int, reason: S.str })),
    quick_seats: S.arr(S.enum(...st.board)),
    seats: S.arr(S.enum(...st.board)),
  });
  return ai.json({
    model: MODELS.chair, system: chairSystem(st), schema, maxTokens: 3000,
    prompt: `A founder brought this to the council:

"""${st.prompt}"""

Set up the room.
- title: the decision in 3 to 7 words.
- decision: one line.
- options: 2 to 4 options with ids A, B, C (D only if truly needed). Always include "don't do it" or "keep doing what you do now", and the obvious smaller version if the founder brought one big idea.
- brief: under 200 words covering the business, resources, what success looks like, and the founder's lean, using only what the founder said. Do not invent facts.
- assumptions: any number or fact you had to assume to make the brief usable, each one line starting with "GIẢ ĐỊNH:" and saying how to check it within 30 days. Keep it to what matters; never present an assumed number as the founder's.
- weights: one entry for every seat, weight 1 to 3 (3 = the decision lives in this pillar, 2 = materially affected, 1 = touched at the edges). Exactly one or two seats at 3. Reason in one line.
- quick_seats: the four seats for a quick council: the two highest-weight seats, the seat that guards the downside (money, capital, or risk) if it is not already in, and the seat most likely to disagree with the others.
- seats: ${st.pick ? "the board for a full council, five to seven seats: every seat at weight 2 or 3, the seat that guards the downside, and the seat most likely to disagree. Leave out seats at weight 1 unless they are the downside or dissent seat." : "every seat (the board is fixed)."}

${LUAT_SO}`,
  });
}

async function chairCruxes(st) {
  const schema = S.obj({
    cruxes: S.arr(S.obj({ question: S.str, sides: S.arr(S.obj({ position: S.str, seats: S.arr(S.enum(...st.board)) })) })),
    unanimous: S.bool,
    note: S.str,
    pressure: S.arr(S.obj({ seat: S.enum(...st.board), ask: S.str })),
  });
  return ai.json({
    model: MODELS.chair, system: chairSystem(st), schema, maxTokens: 3000,
    prompt: `${briefBlock(st)}

ROUND 1 CARDS
${cardsBlock(st, 1)}

Name the one to three cruxes: the underlying disagreements that explain why seats split (a fact, a number, or a value such as speed versus safety), with the seats on each side.
Unanimity check: if every seat's top option is the same and their scores for it sit within 1 point, set unanimous true, make the strongest unargued alternative a crux, and say which seats whose pillars are most at risk must argue it at full strength.
note: one or two plain sentences for the founder on what the room is fighting about.
pressure: for each seat that holds a minority view, or that the unanimity check names, one sentence telling it exactly which argument it must answer in Round 2. Leave others out. When a crux is a number nobody has, say "Chưa có số: …" instead of picking one.

${LUAT_SO}`,
  });
}

async function chairDraft(st, interim) {
  const schema = S.obj({
    option: S.str,
    label: S.enum("GO", "GO WITH CONDITIONS", "RESHAPE", "WAIT", "DON'T DO IT"),
    recommendation: S.str,
    conditions: S.arr(S.str),
    next_steps: S.arr(S.str),
    cheapest_test: S.str,
    kill_criteria: S.str,
  });
  return ai.json({
    model: MODELS.chair, system: chairSystem(st), schema, maxTokens: 3000,
    prompt: `${briefBlock(st)}

ROUND 2 CARDS (the debate)
${cardsBlock(st, 2)}

Interim weighted option scores: ${JSON.stringify(Object.fromEntries(Object.entries(interim).map(([k, v]) => [k, v.score])))}
Band rule: 7.5+ GO, 6.0 to 7.4 GO WITH CONDITIONS, 4.5 to 5.9 RESHAPE, under 4.5 DON'T DO IT. Use WAIT when the top option is good but depends on a prerequisite not met yet. Overrides: any seat at RUIN RISK likely caps at RESHAPE until a mitigation it endorsed is in the conditions.

Write the draft resolution. Weigh arguments, not headcount: one seat with a decisive fact beats three with vibes. Merge duplicate conditions, keep each checkable (a number or a date), and where seats gave different numbers keep the one with a source (the brief, SỐ LIỆU, or arithmetic on them) and say whose; a number without one becomes "GIẢ ĐỊNH: …" or "Chưa có số: …". Next steps carry dates or day counts. recommendation is one or two sentences.

${LUAT_SO}`,
  });
}

async function chairVerdict(st, finalScores, recommended) {
  const lastRound = st.rounds.at(-1);
  const schema = S.obj({
    label: S.enum("GO", "GO WITH CONDITIONS", "RESHAPE", "WAIT", "DON'T DO IT"),
    call: S.str,
    override_note: S.str,
    why: S.arr(S.obj({ point: S.str, seat: S.str, framework: S.str })),
    fights: S.arr(S.obj({ crux: S.str, story: S.str })),
    minority: S.obj({ seat: S.str, quote: S.str, would_have_to_be_true: S.str }),
    amendments: S.arr(S.obj({ seat: S.str, amendment: S.str, adopted: S.bool, reason: S.str })),
    conditions: S.arr(S.str),
    next_steps: S.arr(S.obj({ when: S.str, action: S.str })),
    cheapest_test: S.str,
    kill_criteria: S.str,
    revisit: S.str,
    so_lieu: SO_LIEU,
  });
  return ai.json({
    model: MODELS.chair, system: chairSystem(st), schema, maxTokens: 5000,
    prompt: `${briefBlock(st)}

CRUXES: ${JSON.stringify(st.cruxes)}

ROUND 2 CARDS
${cardsBlock(st, 2)}

${lastRound === 3 ? `DRAFT RESOLUTION\n${JSON.stringify(st.draft)}\n\nROUND 3 VOTES\n${cardsBlock(st, 3)}` : "(Quick mode: Round 3 skipped.)"}

FINAL WEIGHTED OPTION SCORES (computed, do not change): ${JSON.stringify(Object.fromEntries(Object.entries(finalScores).map(([k, v]) => [k, v.score])))}
Recommended option by score: ${recommended}. Band for it: ${bandFor(finalScores[recommended]?.score)}.
Any seat at ruin risk likely: ${st.seats.filter((k) => st.cards[lastRound][k]?.parsed.ruin === "likely" || st.cards[2][k]?.parsed.ruin === "likely").join(", ") || "none"}.

Write the verdict for the founder.
- label: the band, or WAIT if the recommended option depends on an unmet prerequisite, or a cap from an override. If you change the band, say why in override_note; otherwise override_note is "".
- call: one or two sentences the founder can act on, naming the option.
- why: 3 to 5 arguments that carried the room, each tagged with the seat and the framework.
- fights: one entry per crux: who was on each side, who moved and why, how it resolved.
- minority: the strongest losing view; quote copies the seat's own words exactly from a card; would_have_to_be_true in one line. If unanimous, use the least-tested assumption instead.
- amendments: every Round 3 amendment, adopted or not, with the reason (empty in quick mode). Adopt when no seat objected or the argument went unanswered.
- conditions, next_steps (with when), cheapest_test, kill_criteria, revisit: final, merged, checkable.
- so_lieu: every number that appears in call, why, conditions, next_steps, cheapest_test and kill_criteria (not dates, deadlines, option letters or the computed scores). so = the number exactly as you wrote it; y = what it measures; loai = "đề bài" (the founder gave it), "số liệu" (from the SỐ LIỆU sheet; nguon = its source as listed there), "tính" (nguon = the arithmetic, using only đề bài and SỐ LIỆU numbers), or "giả định" (nguon = how to check it within 30 days). Write y and nguon in Vietnamese. Never list a number you cannot source as "số liệu": mark it "giả định" or take it out of the verdict.

${LUAT_SO}`,
  });
}

// Every number in the verdict and the Chair's view is listed with where it came from; kiemSo then checks it.
const SO_LIEU = S.arr(S.obj({ so: S.str, y: S.str, loai: S.enum("đề bài", "số liệu", "tính", "giả định"), nguon: S.str }));
// Numbers the council may use: the founder's brief and additions with the secretary's sheet (in a follow-up, not the
// last verdict's own numbers), plus what the app computed (scores, confidence, weights).
const dauVaoSo = (st) => String(st.prompt || "").split("\n").filter((l) => !/^KẾT LUẬN LẦN TRƯỚC:/.test(l)).join("\n");
const cacBanSo = (v, st) => [...Object.values(v?.scores || {}).map((x) => x.score), v?.confidence, v?.support, v?.spread, ...Object.values(st.weights || {}).map((w) => w.weight)];
const vanBanKetLuan = (v) => [v.call, ...(v.why || []).map((w) => w.point), ...(v.conditions || []), ...(v.next_steps || []).map((n) => n.action), v.cheapest_test, v.kill_criteria].join("\n");

const CHAIR_VIEW = S.obj({
  dong_y: S.enum("đồng ý", "đồng ý có điều kiện", "không đồng ý"),
  nhan_dinh: S.str,
  ly_do: S.arr(S.obj({ y: S.str, khung: S.str, nguon: S.str })),
  bo_buoc: S.str,
  thu_nhanh: S.str,
  so_lieu: SO_LIEU,
});

/** After the verdict the Chair speaks from his own brain: does he agree, why, what he would delete,
 * the fastest test. He never changes the verdict, and a failure here leaves the verdict and the
 * phiếu as they are: the page just says there is no view. */
export async function addChairView(s, st, json = ai.json, { timeoutMs = Number(env("CHAIR_VIEW_TIMEOUT_MS")) || 300000 } = {}) {
  emit(s, "phase", { phase: "chair_view", label: "The Chair is giving his own view" });
  const key = chairSeat();
  const v = st.verdict;
  const last = st.rounds.at(-1);
  // a hung call must not hold the phiếu and the next council hostage (the CLI child is left to finish on its own)
  let timer;
  const quaHan = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`Chủ toạ trả lời quá ${Math.round(timeoutMs / 1000)} giây`)), timeoutMs); });
  try {
    const view = await Promise.race([quaHan, json({
      model: MODELS.chair, system: systemFor(key), schema: CHAIR_VIEW, maxTokens: 2500,
      prompt: `${briefBlock(st)}

ĐIỂM VÊNH: ${JSON.stringify(st.cruxes || [])}

CÁC THẺ VÒNG 2 (tranh luận)
${cardsBlock(st, 2)}
${last === 3 ? `\nPHIẾU VÒNG 3\n${cardsBlock(st, 3)}\n` : ""}
KẾT LUẬN CỦA HỘI ĐỒNG (đã chốt theo điểm, không đổi): ${v.label} · phương án ${v.recommended} · ${v.call}
Điểm: ${JSON.stringify(Object.fromEntries(Object.entries(v.scores || {}).map(([k, x]) => [k, x.score])))}
Điều kiện: ${(v.conditions || []).join("; ") || "không có"}

Bạn là Chủ toạ của hội đồng này, nói bằng kiến thức của chính mình (não ở trên). Bạn không bỏ phiếu và không đổi kết luận của hội đồng. Viết tiếng Việt, câu ngắn, xưng "tôi", gọi người hỏi là "bạn":
- dong_y: bạn đồng ý, đồng ý có điều kiện, hay không đồng ý với kết luận.
- nhan_dinh: tối đa 2 câu, dưới 50 từ, ý chính của bạn (câu này được đọc to ở bàn).
- ly_do: 2 đến 4 lý do, mỗi lý do tối đa 3 câu, có con số khi có. Mỗi lý do gắn một khung của bạn (khung, tên ngắn) và một mã nguồn S0xx có trong não (nguon). Muốn trích nguyên văn thì để câu tiếng Anh trong ngoặc kép, ngay sau là (S0xx), dưới 45 từ, chép đúng từng chữ trong não.
- bo_buoc: một yêu cầu hoặc một bước nên xoá, kèm người sở hữu nếu biết.
- thu_nhanh: thí nghiệm nhanh nhất theo bạn, có con số và hạn.
- so_lieu: mọi con số về doanh nghiệp này bạn viết ở trên (không tính ngày tháng, mã nguồn S0xx, điểm của hội đồng): so là con số đúng như bạn viết, y là nó đo cái gì, loai là "đề bài", "số liệu" (nguon = nguồn ghi trong tờ SỐ LIỆU), "tính" (nguon = phép tính, chỉ từ số đề bài và SỐ LIỆU) hoặc "giả định" (nguon = cách kiểm trong 30 ngày). Số kể về công ty của chính bạn không thuộc doanh nghiệp này, không kê.

${LUAT_SO}`,
    })]);
    const text = [view.nhan_dinh, ...view.ly_do.map((l) => `${l.y} (${l.nguon})`), view.bo_buoc, view.thu_nhanh].join("\n");
    const kiem_so = kiemSo({ dauVao: dauVaoSo(st), soLieu: [...(view.so_lieu || []), ...(v.so_lieu || [])], cacBan: cacBanSo(v, st), vanBan: text.replace(/\(S\d{3}[^)]*\)/g, " ") });
    emit(s, "chair_view", { view, quotes: checkQuotes(key, text), kiem_so });
  } catch (e) {
    console.error("chair_view", e);
    emit(s, "chair_view", { error: String(e.message || e) });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- the run
async function runSeat(s, st, round, key, prompt) {
  const seat = byKey[key];
  emit(s, "seat_start", { round, seat: key });
  let text = "";
  try {
    text = await ai.stream({
      model: MODELS.seat, system: systemFor(key), maxTokens: 1400,
      messages: [{ role: "user", content: prompt }],
      onText: (d) => { text += d; emit(s, "delta", { round, seat: key, text: d }); },
    });
  } catch (e) {
    emit(s, "seat_error", { round, seat: key, error: String(e.message || e) });
    throw e;
  }
  const parsed = parseCard(text, st.options.map((o) => o.id));
  const quotes = checkQuotes(key, text);
  st.cards[round][key] = { text, parsed, quotes };
  emit(s, "seat_done", { round, seat: key, text, parsed, quotes, name: seat.name });
}

async function roundAll(s, st, round, promptFn) {
  emit(s, "round_start", { round });
  // stagger starts slightly so speech bubbles open in a ripple around the table
  await Promise.all(st.seats.map((k, i) => new Promise((r) => setTimeout(r, i * 350)).then(() => runSeat(s, st, round, k, promptFn(st, byKey[k])))));
  const scores = optionScores(st, round);
  st.scores[round] = scores;
  emit(s, "round_done", { round, scores });
}

export function startCouncil(prompt, mode = "full", extra = {}) {
  const s = newSession(prompt, mode, extra);
  run(s).catch((e) => {
    s.status = "error";
    emit(s, "error", { error: String(e.message || e) });
    for (const res of s.subs) res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
    save(s);
  });
  return s;
}

async function run(s) {
  // "default" seats the saved default board; "ask" and "auto" let the Chair pick from every seat
  // (there is no one to ask in the room, so "ask" picks like "auto" here)
  loadRoster();
  const pick = BOARD.mode !== "default";
  const st = (s.state = { prompt: s.prompt, mode: s.mode, pick, board: tableBoard(pick, SEATS.map((x) => x.key), defaultBoard(), chairSeat()), cards: { 1: {}, 2: {}, 3: {} }, scores: {}, rounds: [] });
  emit(s, "phase", { phase: "setup", label: "The Chair is reading your question" });
  const setup = await chairSetup(st);
  Object.assign(st, {
    title: setup.title, decision: setup.decision, brief: setup.brief,
    options: setup.options, assumptions: setup.assumptions,
    weights: Object.fromEntries(st.board.map((k) => [k, { weight: 1, reason: "" }])),
  });
  for (const w of setup.weights) if (st.weights[w.seat]) st.weights[w.seat] = { weight: Math.max(1, Math.min(3, w.weight)), reason: w.reason };
  const picked = [...new Set(setup.seats || [])].filter((k) => st.board.includes(k)).slice(0, 9);
  const full = pick && picked.length >= 3 ? picked : st.board.slice(0, 9);
  st.seats = s.mode === "quick" ? [...new Set(setup.quick_seats)].filter((k) => st.board.includes(k)).slice(0, 4) : full;
  if (s.mode === "quick" && st.seats.length < 4) {
    for (const k of full) if (st.seats.length < 4 && !st.seats.includes(k)) st.seats.push(k);
  }
  st.board = st.seats.slice(); // later Chair calls only see the seats at the table
  emit(s, "setup", { title: st.title, decision: st.decision, brief: st.brief, options: st.options, assumptions: st.assumptions, weights: st.weights, seats: st.seats, mode: s.mode });

  emit(s, "phase", { phase: "round1", label: "Round 1: opening positions" });
  st.rounds.push(1);
  await roundAll(s, st, 1, round1Prompt);

  emit(s, "phase", { phase: "cruxes", label: "The Chair is finding the fault lines" });
  const cx = await chairCruxes(st);
  st.cruxes = cx.cruxes;
  st.pressure = Object.fromEntries((cx.pressure || []).map((p) => [p.seat, p.ask]));
  emit(s, "cruxes", { cruxes: cx.cruxes, unanimous: cx.unanimous, note: cx.note, pressure: st.pressure });

  emit(s, "phase", { phase: "round2", label: "Round 2: the debate" });
  st.rounds.push(2);
  await roundAll(s, st, 2, round2Prompt);

  const s2 = st.scores[2];
  const top2 = Object.entries(s2).sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))[0][0];
  const vals = st.seats.map((k) => st.cards[2][k]?.parsed.optionScores[top2]).filter((v) => typeof v === "number");
  const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  const ruin = st.seats.some((k) => st.cards[2][k]?.parsed.ruin === "likely");
  const skip3 = s.mode === "quick" && spread <= 3 && !ruin;

  if (!skip3) {
    emit(s, "phase", { phase: "draft", label: "The Chair is drafting a resolution" });
    st.draft = await chairDraft(st, s2);
    emit(s, "draft", { draft: st.draft });
    emit(s, "phase", { phase: "round3", label: "Round 3: the vote" });
    st.rounds.push(3);
    await roundAll(s, st, 3, round3Prompt);
  } else {
    emit(s, "phase", { phase: "skip3", label: `Quick mode: spread ${spread} and no ruin risk, so the vote round is skipped` });
  }

  const { last, finalScores, recommended, spreadF, confidence, support, votes } = finalNumbers(st);

  emit(s, "phase", { phase: "verdict", label: "The Chair is writing the verdict" });
  const v = await chairVerdict(st, finalScores, recommended);
  st.verdict = { ...v, recommended, scores: finalScores, spread: spreadF, confidence, support, votes, disclaimer: DISCLAIMER };
  st.verdict.kiem_so = kiemSo({ dauVao: dauVaoSo(st), soLieu: v.so_lieu, cacBan: cacBanSo(st.verdict, st), vanBan: vanBanKetLuan(v) });
  emit(s, "verdict", { verdict: st.verdict, seats: verdictSeats(st, last) });
  await addChairView(s, st);
  finishRun(s);
}

/** End of a run. A council started from the hỏi rounds writes its phiếu here, before `end`, and the
 * page is told how that went: { type: "phieu", path } or { type: "phieu", error }. */
export function finishRun(s, persist = save) {
  if (s.onDone) {
    try {
      const r = s.onDone(s);
      s.phieu = r.path;
      emit(s, "phieu", { path: r.path, ...(r.cap_nhat ? { cap_nhat: true } : {}), ...(r.so_doi != null ? { so_doi: r.so_doi } : {}) });
    }
    // a follow-up marks s.cap_nhat before it writes, so a failure still reads "chưa cập nhật được phiếu"
    catch (e) { console.error("onDone", e); emit(s, "phieu", { error: String(e.message || e), ...(s.cap_nhat ? { cap_nhat: true } : {}) }); }
  }
  s.status = "done";
  emit(s, "usage", { usage: ai.usage });
  for (const res of s.subs) res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
  persist(s);
}

/** The verdict's numbers, computed from the last round's cards (shared with the folder watcher). */
export function finalNumbers(st) {
  const last = st.rounds.at(-1);
  const finalScores = st.scores[last] || optionScores(st, last);
  const recommended = Object.entries(finalScores).sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0))[0][0];
  const fv = st.seats.map((k) => st.cards[last][k]?.parsed.optionScores[recommended]).filter((v) => typeof v === "number");
  const confs = st.seats.map((k) => st.cards[2][k]?.parsed.confidence ?? st.cards[1][k]?.parsed.confidence).filter((v) => typeof v === "number");
  const spreadF = fv.length ? Math.max(...fv) - Math.min(...fv) : 0;
  const confidence = confs.length ? Math.max(1, Math.min(10, Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 2) - (spreadF >= 5 ? 1 : 0))) : null;
  const support = last === 3 ? (() => {
    let n = 0, d = 0;
    for (const k of st.seats) { const v = st.cards[3][k]?.parsed.finalScore; if (typeof v === "number") { n += v * st.weights[k].weight; d += st.weights[k].weight; } }
    return d ? Math.round((n / d) * 10) / 10 : null;
  })() : null;
  const votes = last === 3 ? st.seats.reduce((acc, k) => { const v = st.cards[3][k]?.parsed.vote || "endorse"; acc[v] = (acc[v] || 0) + 1; return acc; }, {}) : null;
  return { last, finalScores, recommended, spreadF, confidence, support, votes };
}

export function verdictSeats(st, last) {
  return st.seats.map((k) => ({
    key: k, weight: st.weights[k].weight,
    stance: st.cards[last][k]?.parsed.vote || st.cards[2][k]?.parsed.stance,
    optionScores: st.cards[last][k]?.parsed.optionScores,
    pillar: st.cards[last][k]?.parsed.pillar ?? st.cards[2][k]?.parsed.pillar,
    moved: st.cards[2][k]?.parsed.moved,
    oneLine: st.cards[3][k]?.parsed.oneLine || st.cards[2][k]?.parsed.stance,
  }));
}

// ---------------------------------------------------------------- persistence
export function save(s) {
  try {
    const st = s.state || {};
    // the id makes the folder unique: a follow-up the same day often gets the same title as its parent
    const dir = s.dir || path.join(SESSIONS_DIR, `${s.id}-${slugify(st.title || s.prompt).slice(0, 40).replace(/-+$/, "")}`);
    fs.mkdirSync(dir, { recursive: true });
    const link = Object.fromEntries(LINK.filter((k) => s[k] != null).map((k) => [k, s[k]]));
    fs.writeFileSync(path.join(dir, "events.json"), JSON.stringify({ id: s.id, prompt: s.prompt, mode: s.mode, status: s.status, title: st.title, ...link, events: s.events }, null, 1));
    if (st.options) {
      const lines = [`# ${st.title}`, "", `Asked: ${s.prompt}`, "", st.brief, "", "Options:", ...st.options.map((o) => `- ${o.id}: ${o.label}`), "", "Assumptions:", ...(st.assumptions || []).map((a) => `- ${a}`), "", "| Seat | Weight | Reason |", "|---|---|---|", ...st.seats.map((k) => `| ${byKey[k].short} | ${st.weights[k].weight} | ${st.weights[k].reason} |`)];
      fs.writeFileSync(path.join(dir, "brief.md"), lines.join("\n") + "\n");
    }
    for (const r of st.rounds || []) {
      const body = (st.seats || []).map((k) => `## ${byKey[k].name} (weight ${st.weights[k].weight})\n\n${st.cards[r][k]?.text || ""}`).join("\n\n");
      fs.writeFileSync(path.join(dir, `round-${r}.md`), `# Round ${r}\n\n${body}\n`);
    }
    if (st.verdict) fs.writeFileSync(path.join(dir, "verdict.md"), verdictMarkdown(st));
    s.dir = dir;
  } catch (e) {
    console.error("save failed", e);
  }
}

function verdictMarkdown(st) {
  const v = st.verdict;
  const opt = (id) => st.options.find((o) => o.id === id)?.label || id;
  const L = [];
  L.push(`# Hội đồng chuyên gia: ${st.title}`, "", `${new Date().toISOString().slice(0, 10)} · Seats: ${st.seats.map((k) => byKey[k].short).join(", ")} · Rounds: ${st.rounds.length} · Mode: ${st.mode}`, "");
  L.push(`## Verdict: ${v.label} (Option ${v.recommended}: ${opt(v.recommended)})`, "", `**The call:** ${v.call}`, "");
  L.push(`Option scores: ${st.options.map((o) => `${o.id} ${v.scores[o.id]?.score ?? "-"}`).join(" · ")}${v.support != null ? ` · Support for the resolution ${v.support}/10` : ""} · Confidence ${v.confidence ?? "-"}/10 · Spread ${v.spread}`);
  if (v.override_note) L.push("", v.override_note);
  L.push("", "Math: " + st.options.map((o) => `${o.id} ${v.scores[o.id]?.math} = ${v.scores[o.id]?.score}`).join(" · "));
  L.push("", "## Why the council landed here", "", ...v.why.map((w) => `- ${w.point} (${w.seat}, ${w.framework})`));
  L.push("", "## Where they fought", "", ...v.fights.map((f) => `- **${f.crux}** ${f.story}`));
  L.push("", "## Minority report", "", `${v.minority.seat}: "${v.minority.quote}" For this to be right: ${v.minority.would_have_to_be_true}`);
  if (v.amendments?.length) L.push("", "## Amendments", "", ...v.amendments.map((a) => `- ${a.seat}: ${a.amendment} ${a.adopted ? "Adopted" : "Not adopted"}: ${a.reason}`));
  L.push("", "## Conditions", "", ...v.conditions.map((c, i) => `${i + 1}. ${c}`));
  L.push("", "## What to do next", "", ...v.next_steps.map((n) => `- **${n.when}:** ${n.action}`));
  L.push("", `**Cheapest test:** ${v.cheapest_test}`, `**Kill criteria:** ${v.kill_criteria}`, `**Revisit:** ${v.revisit}`, "", "---", DISCLAIMER, "");
  return L.join("\n");
}

export function listSaved() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR)
    .map((d) => path.join(SESSIONS_DIR, d, "events.json"))
    .filter((p) => fs.existsSync(p))
    .map((p) => { const j = JSON.parse(fs.readFileSync(p, "utf8")); return { id: j.id, title: j.title || j.prompt.slice(0, 60), prompt: j.prompt, mode: j.mode, status: j.status, file: p }; })
    .sort((a, b) => (a.id < b.id ? 1 : -1));
}

export function loadSaved(id) {
  const hit = listSaved().find((x) => x.id === id);
  return hit ? JSON.parse(fs.readFileSync(hit.file, "utf8")) : null;
}
