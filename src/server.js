// Local web UI: serves ui/index.html, runs reviews in the background, streams the trace over SSE.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseGroups } from "./parse.js";
import { DEFAULT_CODEBASE, expand, listRepos } from "./checkout.js";
import { reviewGroup, loadSession, listSessions, ROOT } from "./review.js";
import { postFinding } from "./post.js";
import { verdictOf } from "./report.js";

const UI = path.join(ROOT, "ui", "index.html");
const RUNS = new Map();   // id -> {id, codebase, groups, events, waiters}

function startRun(text, codebase) {
  const groups = parseGroups(text);
  if (!groups.length) throw new Error("no PR links found");
  const cb = expand(codebase || DEFAULT_CODEBASE);
  if (!fs.existsSync(cb) || !fs.statSync(cb).isDirectory()) throw new Error(`codebase root not found: ${cb}`);
  const run = {
    id: randomUUID().slice(0, 8), codebase: cb,
    groups: groups.map((g, i) => ({ index: i, label: g.label, prs: g.prs, status: "queued", session: null, findings: null, error: null })),
    events: [], waiters: [],
  };
  RUNS.set(run.id, run);
  runReview(run);
  return run;
}

function push(run, ev) {
  run.events.push(ev);
  const w = run.waiters; run.waiters = [];
  for (const resolve of w) resolve();
}

function now() { return new Date().toTimeString().slice(0, 8); }

async function runReview(run) {
  for (const g of run.groups) {
    const gi = g.index;
    g.status = "running";
    push(run, { ts: now(), group: gi, kind: "status", status: "running" });
    try {
      const sessionDir = await reviewGroup(g.label, g.prs, { codebase: run.codebase, quiet: true, sink: (ev) => push(run, { ...ev, group: gi }) });
      g.session = path.basename(sessionDir);
      const data = JSON.parse(fs.readFileSync(path.join(sessionDir, "findings.json"), "utf8"));
      g.findings = data.findings.filter((f) => verdictOf(f) !== "REFUTED").length;
      g.status = "done";
    } catch (e) {
      g.status = "error";
      g.error = String(e.message || e);
      push(run, { ts: now(), group: gi, kind: "error", phase: "done", msg: g.error });
    }
    push(run, { ts: now(), group: gi, kind: "status", status: g.status, session: g.session, findings: g.findings });
  }
  push(run, { ts: now(), group: -1, kind: "run_done" });
}

const publicRun = (run) => ({ id: run.id, codebase: run.codebase, groups: run.groups });

function json(res, code, data) {
  const raw = Buffer.from(JSON.stringify(data));
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": raw.length });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (d) => { s += d; });
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

async function sse(req, res, run, from) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  let i = from;
  let open = true;
  req.on("close", () => { open = false; });
  while (open) {
    if (i >= run.events.length) {
      await Promise.race([new Promise((r) => run.waiters.push(r)), new Promise((r) => setTimeout(r, 15000))]);
      if (i >= run.events.length) { res.write(": keepalive\n\n"); continue; }
    }
    const batch = run.events.slice(i);
    for (const ev of batch) { res.write(`id: ${i}\ndata: ${JSON.stringify(ev)}\n\n`); i += 1; }
    if (batch.at(-1)?.kind === "run_done") { res.end(); return; }
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://localhost");
    const q = u.searchParams;
    try {
      if (req.method === "GET") {
        if (u.pathname === "/" || u.pathname === "/index.html") {
          const raw = fs.readFileSync(UI);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": raw.length });
          return res.end(raw);
        }
        if (u.pathname === "/api/config") {
          const cb = expand(q.get("codebase") || DEFAULT_CODEBASE);
          const exists = fs.existsSync(cb) && fs.statSync(cb).isDirectory();
          return json(res, 200, { codebase: cb, exists, repos: exists ? listRepos(cb).length : 0 });
        }
        if (u.pathname === "/api/parse") return json(res, 200, parseGroups(q.get("text") || ""));
        if (u.pathname === "/api/run") {
          const run = RUNS.get(q.get("id"));
          return run ? json(res, 200, publicRun(run)) : json(res, 404, { error: "no such run" });
        }
        if (u.pathname === "/api/events") {
          const run = RUNS.get(q.get("id"));
          if (!run) return json(res, 404, { error: "no such run" });
          const from = Number(req.headers["last-event-id"] ?? q.get("from") ?? 0);
          return sse(req, res, run, Number.isFinite(from) ? (req.headers["last-event-id"] ? from + 1 : from) : 0);
        }
        if (u.pathname === "/api/sessions") return json(res, 200, listSessions());
        if (u.pathname === "/api/session") return json(res, 200, loadSession(q.get("name")));
        return json(res, 404, { error: "not found" });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        if (u.pathname === "/api/review") return json(res, 200, publicRun(startRun(body.text || "", body.codebase)));
        if (u.pathname === "/api/post") {
          if (body.confirmed !== true) return json(res, 400, { error: "confirmation flag missing" });
          return json(res, 200, postFinding(body.session, body.id, body.body));
        }
        return json(res, 404, { error: "not found" });
      }
      json(res, 405, { error: "method not allowed" });
    } catch (e) {
      json(res, /no findings.json|bad session|no such/.test(e.message) ? 404 : 400, { error: String(e.message || e) });
    }
  });
}

export function serve(port = 8765) {
  const srv = createServer();
  srv.listen(port, "127.0.0.1", () => console.log(`advreview UI: http://localhost:${port}`));
  return srv;
}
