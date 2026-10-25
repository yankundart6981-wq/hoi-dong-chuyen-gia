import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "./env.mjs";

const URL = "https://api.anthropic.com/v1/messages";
const RETRY = new Set([429, 500, 502, 503, 529]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function headers() {
  return {
    "x-api-key": env("ANTHROPIC_API_KEY"),
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
}

// Running token tally for the whole app, shown in the UI.
export const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
function addUsage(u = {}) {
  usage.input += u.input_tokens || 0;
  usage.output += u.output_tokens || 0;
  usage.cacheRead += u.cache_read_input_tokens || 0;
  usage.cacheWrite += u.cache_creation_input_tokens || 0;
  usage.calls += 1;
}

// With CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) in .env, every call goes through the
// Claude Code CLI on the user's Claude subscription instead of ANTHROPIC_API_KEY. The token lasts
// about a year and never touches the keychain login, so it survives `claude` being logged out.
export const BACKEND = env("CLAUDE_CODE_OAUTH_TOKEN") ? "cli" : "api";
const CLI_CWD = path.join(os.tmpdir(), "roast-room-cli"); // empty folder: no project CLAUDE.md or settings

function claudeBin() {
  const local = path.join(os.homedir(), ".local", "bin", "claude");
  return env("CLAUDE_BIN") || (fs.existsSync(local) ? local : "claude");
}

const systemText = (system) => (Array.isArray(system) ? system.map((b) => b.text).join("\n\n") : system);
const promptText = (messages) =>
  messages.map((m) => (typeof m.content === "string" ? m.content : m.content.map((b) => b.text || "").join(""))).join("\n\n");

function cliArgs(model, system, { tools = "", addDirs = [], effort = env("COUNCIL_EFFORT") } = {}) {
  const a = ["-p", "--model", model, "--system-prompt", systemText(system), "--tools", tools,
    "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "project",
    "--disable-slash-commands", "--no-session-persistence", "--output-format", "stream-json", "--verbose"];
  for (const d of addDirs) a.push("--add-dir", d);
  if (effort) a.push("--effort", effort);
  return a;
}

/** One structured answer through the CLI, optionally with read-only tools over extra folders. */
export async function askJson({ model, system, prompt, schema, tools = "", addDirs = [], effort }) {
  if (BACKEND !== "cli") throw new Error("Cần CLAUDE_CODE_OAUTH_TOKEN trong .env");
  const r = await cli([...cliArgs(model, system, { tools, addDirs, effort }), "--json-schema", JSON.stringify(schema)], prompt);
  addUsage(r.usage);
  if (r.structured_output) return r.structured_output;
  return JSON.parse(String(r.result).replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

/** Run one `claude -p` turn; calls onEvent for each stream-json line. Resolves with the result event. */
function cli(args, input, onEvent = () => {}) {
  fs.mkdirSync(CLI_CWD, { recursive: true });
  const childEnv = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: env("CLAUDE_CODE_OAUTH_TOKEN"),
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };
  delete childEnv.ANTHROPIC_API_KEY; // an API key would win over the subscription token
  delete childEnv.ANTHROPIC_AUTH_TOKEN;
  return new Promise((resolve, reject) => {
    const p = spawn(claudeBin(), args, { cwd: CLI_CWD, env: childEnv });
    let buf = "", err = "", result = null;
    const line = (raw) => {
      let ev;
      try { ev = JSON.parse(raw); } catch { return; }
      if (ev.type === "result") result = ev;
      else onEvent(ev);
    };
    p.stdout.on("data", (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { line(buf.slice(0, i).trim()); buf = buf.slice(i + 1); }
    });
    p.stderr.on("data", (c) => { err += c; });
    p.on("error", reject);
    p.on("close", (code) => {
      if (buf.trim()) line(buf.trim());
      if (!result) return reject(new Error(`claude CLI exited ${code}: ${err.slice(0, 300)}`));
      if (result.is_error) return reject(new Error(`Claude Code: ${String(result.result).slice(0, 300)}`));
      resolve(result);
    });
    p.stdin.end(input);
  });
}

async function streamCli({ model, system, messages, onText }) {
  let text = "";
  const r = await cli([...cliArgs(model, system), "--include-partial-messages"], promptText(messages), (ev) => {
    const d = ev.type === "stream_event" && ev.event?.type === "content_block_delta" ? ev.event.delta : null;
    if (d?.type === "text_delta") { text += d.text; onText(d.text); }
  });
  addUsage(r.usage);
  return r.result || text;
}

async function jsonCli({ model, system, prompt, schema }) {
  const r = await cli([...cliArgs(model, system), "--json-schema", JSON.stringify(schema)], prompt);
  addUsage(r.usage);
  if (r.structured_output) return r.structured_output;
  return JSON.parse(String(r.result).replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

/** Stream a message; calls onText(delta) as text arrives. Returns the full text. */
export async function stream({ model, system, messages, maxTokens = 2000, onText = () => {} }) {
  if (BACKEND === "cli") return streamCli({ model, system, messages, onText });
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ model, system, messages, max_tokens: maxTokens, stream: true }),
    });
    if (RETRY.has(res.status)) { await sleep(Math.min(30000, 2000 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    let text = "";
    let buf = "";
    const dec = new TextDecoder();
    const finalUsage = {};
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          text += ev.delta.text;
          onText(ev.delta.text);
        } else if (ev.type === "message_start") {
          Object.assign(finalUsage, ev.message?.usage || {});
        } else if (ev.type === "message_delta") {
          Object.assign(finalUsage, ev.usage || {});
        } else if (ev.type === "error") {
          throw new Error(`Anthropic stream error: ${JSON.stringify(ev.error).slice(0, 300)}`);
        }
      }
    }
    addUsage(finalUsage);
    return text;
  }
  throw new Error("Anthropic API kept refusing after retries");
}

/** One call with structured JSON output matching `schema`. */
export async function json({ model, system, prompt, schema, maxTokens = 4000 }) {
  if (BACKEND === "cli") return jsonCli({ model, system, prompt, schema });
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model, system, max_tokens: maxTokens,
        output_config: { format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (RETRY.has(res.status)) { await sleep(Math.min(30000, 2000 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    addUsage(j.usage);
    if (j.stop_reason === "max_tokens") throw new Error("Chair output hit max_tokens");
    return JSON.parse(j.content.map((b) => b.text || "").join(""));
  }
  throw new Error("Anthropic API kept refusing after retries");
}

// JSON schema helpers
export const S = {
  str: { type: "string" },
  num: { type: "number" },
  int: { type: "integer" },
  bool: { type: "boolean" },
  arr: (items) => ({ type: "array", items }),
  obj: (props) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false }),
  enum: (...v) => ({ type: "string", enum: v }),
};
