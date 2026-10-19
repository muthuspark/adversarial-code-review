// JSON schemas enforced on claude -p through --json-schema.

export const SEVERITY = ["critical", "high", "medium"];

export const HUNT_SCHEMA = {
  type: "object",
  required: ["summary", "spec", "cross_pr_notes", "findings"],
  properties: {
    summary: { type: "string" },
    spec: {
      type: "object",
      required: ["found", "source", "requirements"],
      properties: {
        found: { type: "boolean" },
        source: { type: "string" },
        requirements: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "text", "status", "evidence"],
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              status: { type: "string", enum: ["met", "partial", "missing", "contradicted"] },
              evidence: { type: "string" },
            },
          },
        },
      },
    },
    cross_pr_notes: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "repo", "pr_number", "file", "line", "severity", "category", "title",
          "problem", "failure_scenario", "evidence", "confidence", "cross_pr", "spec_gap",
          "affected_repos", "suggested_fix"],
        properties: {
          id: { type: "string" },
          repo: { type: "string" },
          pr_number: { type: "integer" },
          file: { type: "string" },
          line: { type: "integer" },
          severity: { type: "string", enum: SEVERITY },
          category: { type: "string" },
          title: { type: "string" },
          problem: { type: "string" },
          failure_scenario: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "integer" },
          cross_pr: { type: "boolean" },
          spec_gap: { type: "boolean" },
          affected_repos: { type: "array", items: { type: "string" } },
          suggested_fix: { type: "string" },
        },
      },
    },
  },
};

export const VERIFY_SCHEMA = {
  type: "object",
  required: ["verdict", "confidence", "reasoning", "evidence", "severity", "failure_scenario"],
  properties: {
    verdict: { type: "string", enum: ["CONFIRMED", "REFUTED", "UNCERTAIN"] },
    confidence: { type: "integer" },
    reasoning: { type: "string" },
    evidence: { type: "string" },
    severity: { type: "string", enum: SEVERITY },
    failure_scenario: { type: "string" },
  },
};
