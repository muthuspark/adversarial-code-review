// gh CLI access with per-owner account selection. Never switches the global active account.
import { execFileSync, spawnSync } from "node:child_process";
import { log } from "./emitter.js";

const ENV_BY_OWNER = new Map();

export function ghAccounts() {
  const r = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  return [...out.matchAll(/Logged in to github\.com account (\S+)/g)].map((m) => m[1]);
}

/** Environment (with GH_TOKEN) for the first logged-in account that can see owner/repo. */
export function ghEnv(owner, repo) {
  if (ENV_BY_OWNER.has(owner)) return ENV_BY_OWNER.get(owner);
  const forced = process.env.ADVREVIEW_GH_USER;
  const users = forced ? [forced] : [null, ...ghAccounts()];
  for (const u of users) {
    const env = { ...process.env };
    if (u) {
      const tok = spawnSync("gh", ["auth", "token", "--user", u], { encoding: "utf8" }).stdout?.trim();
      if (!tok) continue;
      env.GH_TOKEN = tok;
    }
    const ok = spawnSync("gh", ["api", `repos/${owner}/${repo}`, "--jq", ".full_name"], { env, encoding: "utf8" }).status === 0;
    if (ok) {
      log(`gh account for ${owner}: ${u || "active"}`);
      ENV_BY_OWNER.set(owner, env);
      return env;
    }
  }
  throw new Error(`no logged-in gh account can see ${owner}/${repo}. Accounts: ${ghAccounts().join(", ")}. Set ADVREVIEW_GH_USER to force one.`);
}

export function gh(args, owner, repo, opts = {}) {
  return execFileSync("gh", args, { env: ghEnv(owner, repo), encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
}

export function ghJson(args, owner, repo) {
  return JSON.parse(gh(args, owner, repo));
}

export const PR_FIELDS = "number,title,body,url,author,baseRefName,baseRefOid,headRefName,headRefOid,files,isDraft,state";

export function prView(owner, repo, number) {
  return ghJson(["pr", "view", String(number), "--repo", `${owner}/${repo}`, "--json", PR_FIELDS], owner, repo);
}

export function prDiff(owner, repo, number) {
  return gh(["pr", "diff", String(number), "--repo", `${owner}/${repo}`], owner, repo);
}
