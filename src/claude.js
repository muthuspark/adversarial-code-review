// One headless claude -p run with structured output and a streamed trace.
import { spawn } from "node:child_process";
import readline from "node:readline";
import { toolSummary } from "./emitter.js";

export const READ_ONLY_TOOLS = [
  "Read", "Grep", "Glob", "Agent",
  "Bash(git log*)", "Bash(git diff*)", "Bash(git show*)",
  "Bash(git blame*)", "Bash(git grep*)", "Bash(git status*)",
  "Bash(ls*)", "Bash(wc*)", "Bash(cat*)", "Bash(head*)", "Bash(tail*)",
];

/**
 * Run claude -p and return the structured_output object.
 * @param {object} o  prompt, schema, cwd, addDirs, model, maxTurns, tag, emit (Emitter), phase
 */
export function claudeJson(o) {
  const { prompt, schema, cwd, addDirs = [], model, maxTurns, tag, emit, phase = "" } = o;
  const args = [
    "-p", prompt,
    "--output-format", "stream-json", "--verbose",
    "--json-schema", JSON.stringify(schema),
    "--permission-mode", "dontAsk",
    "--allowedTools", ...READ_ONLY_TOOLS,
    "--setting-sources", "project",
    "--max-turns", String(maxTurns),
  ];
  for (const d of addDirs) args.push("--add-dir", d);
  if (model) args.push("--model", model);

  emit.emit("info", `claude ${tag}: start`, phase);
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let result = null;
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d; });
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === "assistant") {
        for (const b of ev.message?.content ?? []) {
          if (b.type === "tool_use") emit.emit("tool", toolSummary(b.name, b.input || {}), phase, { tag });
          else if (b.type === "text" && b.text?.trim()) emit.emit("text", b.text.trim().slice(0, 600), phase, { tag });
        }
      } else if (ev.type === "result") {
        result = ev;
      }
    });
    proc.on("error", (e) => reject(new Error(`cannot start claude: ${e.message}`)));
    proc.on("close", (code) => {
      if (code !== 0 && !result) return reject(new Error(`claude ${tag} failed (exit ${code}):\n${stderr.slice(-2000)}`));
      if (!result) return reject(new Error(`claude ${tag}: no result event`));
      if (result.is_error) return reject(new Error(`claude ${tag}: error result:\n${result.result}`));
      const data = result.structured_output;
      if (data == null) return reject(new Error(`claude ${tag}: no structured_output. stop_reason=${result.stop_reason} result=${String(result.result).slice(0, 500)}`));
      const cost = result.total_cost_usd ?? 0;
      emit.emit("ok", `claude ${tag}: done, turns=${result.num_turns} cost=$${cost.toFixed(2)} out_tokens=${result.usage?.output_tokens}`,
        phase, { tag, cost, turns: result.num_turns });
      resolve(data);
    });
  });
}
