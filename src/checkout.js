// Repository lookup under the codebase root, fallback clones, and PR worktrees.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { ghEnv } from "./gh.js";
import { log } from "./emitter.js";

export const CACHE = process.env.ADVREVIEW_CACHE || path.join(os.homedir(), ".cache", "advreview");
export const DEFAULT_CODEBASE = expand(process.env.ADVREVIEW_CODEBASE || "~/workspace/git");

export function expand(p) {
  if (!p) return p;
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : path.resolve(p);
}

function git(args, cwd, opts = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

/** Every git repo directly under root, with its origin slug (owner/repo or ""). */
export function listRepos(root) {
  const out = [];
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) return out;
  for (const name of fs.readdirSync(root).sort()) {
    const d = path.join(root, name);
    if (!fs.existsSync(path.join(d, ".git"))) continue;
    const r = spawnSync("git", ["remote", "get-url", "origin"], { cwd: d, encoding: "utf8" });
    const m = (r.stdout || "").trim().match(/github\.com[:/]([^/]+\/[^/\s]+?)(?:\.git)?$/);
    out.push({ dir: d, name, slug: m ? m[1] : "" });
  }
  return out;
}

export function findLocalRepo(owner, repo, codebase) {
  const want = `${owner}/${repo}`.toLowerCase();
  return listRepos(codebase).find((r) => r.slug.toLowerCase() === want)?.dir || null;
}

/** Path of a clone for owner/repo: local under the codebase root, else the cache. Fetches origin. */
export function ensureClone(owner, repo, codebase) {
  const local = findLocalRepo(owner, repo, codebase);
  if (local) {
    log(`using local clone ${local} (fetch origin)`);
    git(["fetch", "--prune", "origin"], local);
    return local;
  }
  const dir = path.join(CACHE, "repos", `${owner}__${repo}`);
  if (fs.existsSync(path.join(dir, ".git"))) {
    log(`fetch ${owner}/${repo}`);
    git(["fetch", "--prune", "origin"], dir);
  } else {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    log(`clone ${owner}/${repo} (first time, full history)`);
    execFileSync("gh", ["repo", "clone", `${owner}/${repo}`, dir], { env: ghEnv(owner, repo), stdio: "inherit" });
  }
  return dir;
}

/** Detached worktree at the PR head commit. Leaves the source clone's branch untouched. */
export function worktreeForPr(clone, pr, dest) {
  const n = pr.number;
  git(["fetch", "origin", `pull/${n}/head:refs/advreview/pr-${n}`, pr.baseRefName], clone);
  if (fs.existsSync(dest)) {
    spawnSync("git", ["worktree", "remove", "--force", dest], { cwd: clone });
    fs.rmSync(dest, { recursive: true, force: true });
  }
  git(["worktree", "prune"], clone);
  git(["worktree", "add", "--detach", dest, pr.headRefOid], clone);
  return dest;
}

export function removeWorktree(clone, dest) {
  spawnSync("git", ["worktree", "remove", "--force", dest], { cwd: clone });
}

export function isCacheClone(dir) {
  return dir.startsWith(CACHE);
}
