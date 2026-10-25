#!/usr/bin/env node
import fs from "node:fs";
if (!process.env.FAKE_CLAUDE_REPLY) process.exit(0);
const args = process.argv.slice(2);
// what each --add-dir held while the call ran (the numbers folder only exists during the call)
const ls = Object.fromEntries(args.flatMap((a, i) => (a === "--add-dir" ? [args[i + 1]] : [])).map((d) => { try { return [d, fs.readdirSync(d).sort()]; } catch { return [d, null]; } }));
let input = ""; process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => setTimeout(() => {
  if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args, input, ls, token: Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN), apiKey: Boolean(process.env.ANTHROPIC_API_KEY) }) + "\n");
  const reply = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_REPLY, "utf8"));
  console.log(JSON.stringify({ type: "system", subtype: "init" }));
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: JSON.stringify(reply), structured_output: reply, usage: { input_tokens: 1, output_tokens: 1 } }));
}, Number(process.env.FAKE_CLAUDE_DELAY_MS) || 0));
