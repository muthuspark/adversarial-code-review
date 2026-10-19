import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePr, parseGroups } from "../src/parse.js";

test("parsePr accepts url with /changes, short form, and path form", () => {
  assert.deepEqual(parsePr("https://github.com/o/r/pull/12/changes"), { owner: "o", repo: "r", number: 12 });
  assert.deepEqual(parsePr("o/r#3"), { owner: "o", repo: "r", number: 3 });
  assert.deepEqual(parsePr("o/r/pull/4"), { owner: "o", repo: "r", number: 4 });
  assert.throws(() => parsePr("nonsense"));
});

test("parseGroups returns one group whatever the blank lines, first text line is label", () => {
  const g = parseGroups("https://github.com/a/b/pull/1/changes\n\nScreen management\nhttps://github.com/a/c/pull/2\n\nignored label\na/d#7\n");
  assert.equal(g.length, 1);
  assert.equal(g[0].label, "Screen management");
  assert.deepEqual(g[0].prs, ["https://github.com/a/b/pull/1/changes", "https://github.com/a/c/pull/2", "a/d#7"]);
  assert.deepEqual(parseGroups("no links here"), []);
});
