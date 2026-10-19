// PR reference and paste parsing.

const PR_URL = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/;
const PR_SHORT = /^([^/#]+)\/([^/#]+)#(\d+)$/;
const PR_PATH = /^([^/#]+)\/([^/#]+)\/pull\/(\d+)$/;

/** Parse one PR reference into {owner, repo, number}. Throws on garbage. */
export function parsePr(ref) {
  const s = ref.trim();
  const m = s.match(PR_URL) || s.match(PR_SHORT) || s.match(PR_PATH);
  if (!m) throw new Error(`cannot parse PR reference: ${ref}`);
  return { owner: m[1], repo: m[2].replace(/\.git$/, ""), number: Number(m[3]) };
}

const LOOKS_LIKE_PR = /github\.com\/[^/]+\/[^/]+\/pull\/\d+/;
const LOOKS_LIKE_SHORT = /^[\w.-]+\/[\w.-]+#\d+$/;

/**
 * Turn pasted text into exactly one PR group: {label, prs}.
 * Every PR line joins the group, whatever the blank lines around it.
 * The first plain text line, if any, is the label. Returns [] when no PR found.
 */
export function parseGroups(text) {
  let label = "";
  const prs = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (LOOKS_LIKE_PR.test(line) || LOOKS_LIKE_SHORT.test(line)) prs.push(line);
    else if (!label) label = line;
  }
  return prs.length ? [{ label, prs }] : [];
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
