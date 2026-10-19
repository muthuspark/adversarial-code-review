// Trace events: written to trace.jsonl, logged to stderr, forwarded to a sink (the web UI).
import fs from "node:fs";
import path from "node:path";

export function log(msg) {
  process.stderr.write(`\x1b[90m[advreview]\x1b[0m ${msg}\n`);
}

const LOGGED = new Set(["info", "ok", "warn", "error", "verdict"]);

export class Emitter {
  constructor(sessionDir = null, sink = null, quiet = false) {
    this.sink = sink;
    this.quiet = quiet;
    this.fd = sessionDir ? fs.openSync(path.join(sessionDir, "trace.jsonl"), "a") : null;
  }

  emit(kind, msg, phase = "", extra = {}) {
    const ev = { ts: new Date().toTimeString().slice(0, 8), phase, kind, msg, ...extra };
    if (this.fd !== null) fs.writeSync(this.fd, JSON.stringify(ev) + "\n");
    if (!this.quiet && LOGGED.has(kind)) log(msg);
    if (this.sink) this.sink(ev);
  }

  close() {
    if (this.fd !== null) { fs.closeSync(this.fd); this.fd = null; }
  }
}

/** Strip the session/workspace prefix so trace lines show repo-relative paths. */
export function shortPath(p) {
  let s = String(p ?? "");
  for (const marker of ["/ws/", "/reviews/"]) {
    const i = s.indexOf(marker);
    if (i >= 0) {
      s = s.slice(i + marker.length);
      if (marker === "/reviews/" && s.includes("/")) s = s.slice(s.indexOf("/") + 1);
      break;
    }
  }
  return s;
}

/** One line describing a tool call, for the trace. */
export function toolSummary(name, inp = {}) {
  switch (name) {
    case "Read": return `Read ${shortPath(inp.file_path)}${inp.offset ? ":" + inp.offset : ""}`;
    case "Grep": return `Grep "${inp.pattern ?? ""}" in ${shortPath(inp.path ?? ".")}`;
    case "Glob": return `Glob ${inp.pattern ?? ""} in ${shortPath(inp.path ?? ".")}`;
    case "Bash": return `$ ${shortPath(inp.command ?? "")}`;
    case "Agent":
    case "Task": return `Agent: ${inp.description || String(inp.prompt ?? "").slice(0, 120)}`;
    case "StructuredOutput": return "Return structured result";
    default: return `${name} ${JSON.stringify(inp).slice(0, 120)}`;
  }
}
