import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLinters } from "../../src/linters/index.js";

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "cah-lint-"));
});
afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  const full = join(repo, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function mkdir(rel: string): void {
  mkdirSync(join(repo, rel), { recursive: true });
}

function bootstrapFullPassingRepo(): void {
  write(
    "README.md",
    `# Project

## What is this

Intro.

## Quick start

Install.

[spec](./docs/spec/)
[handbook](./docs/handbook/)
[workflow](./docs/workflow/coding-workflow.md)
`,
  );
  for (const d of ["docs/spec", "docs/decisions", "docs/handbook", "docs/tests", "docs/workflow"]) {
    mkdir(d);
  }
  write("package.json", "{}");
  write(
    "docs/tests/integration-tests.md",
    `---
tracks: [package.json]
---

# Integration tests
`,
  );
  write(
    "docs/tests/e2e-tests.md",
    `---
tracks: [package.json]
---

# E2E tests
`,
  );
  write(
    "docs/workflow/coding-workflow.md",
    `---
tracks: [package.json]
---

# Coding workflow
`,
  );
  write(
    ".gitignore",
    ".harness-overrides/\n.harness-manifest.json\n.claude/\n.codex/\n.opencode/\n.agents/\n.vaubaan/\nAGENTS.md\nCLAUDE.md\n.mcp.json\n",
  );
}

describe("lint integration on synthetic repos", () => {
  it("returns pass=true on minimally bootstrapped repo", () => {
    bootstrapFullPassingRepo();
    const report = runLinters(repo);
    if (!report.summary.pass) {
      console.log(JSON.stringify(report.issues, null, 2));
    }
    expect(report.summary.pass).toBe(true);
  });

  it("returns pass=false on empty repo with errors aggregated", () => {
    const report = runLinters(repo);
    expect(report.summary.pass).toBe(false);
    expect(report.summary.errors).toBeGreaterThanOrEqual(5);
  });

  it("flags spec tech-agnostic violation", () => {
    bootstrapFullPassingRepo();
    write("docs/spec/system.md", "# System\n\nUses Next.js and Supabase.\n");
    const report = runLinters(repo);
    expect(report.summary.pass).toBe(false);
    expect(report.issues.some((i) => i.linter === "lint:spec-tech-agnostic")).toBe(true);
  });

  it("flags ADR missing required sections", () => {
    bootstrapFullPassingRepo();
    write("docs/decisions/0001-bad.md", "# Bad ADR\n\nJust a sentence.\n");
    const report = runLinters(repo);
    expect(report.summary.pass).toBe(false);
    expect(report.issues.some((i) => i.linter === "lint:decision-schema")).toBe(true);
  });

  it("stays green when the optional docs/quality/ pillar is complete", () => {
    bootstrapFullPassingRepo();
    write(
      "docs/quality/code-quality.md",
      "# Code quality\n\n## Mechanical checks\n\n## Project rules\n\n## Accepted deviations\n",
    );
    const report = runLinters(repo);
    expect(report.issues.filter((i) => i.linter === "lint:quality-schema")).toEqual([]);
    expect(report.summary.pass).toBe(true);
  });

  it("fails when docs/quality/ exists with an incomplete code-quality.md", () => {
    bootstrapFullPassingRepo();
    write("docs/quality/code-quality.md", "# Code quality\n\n## Project rules\n");
    const report = runLinters(repo);
    expect(report.summary.pass).toBe(false);
    expect(report.issues.filter((i) => i.linter === "lint:quality-schema")).toHaveLength(2);
  });

  it("filters by --pillar", () => {
    bootstrapFullPassingRepo();
    write("docs/spec/x.md", "Uses React heavily.\n");
    const report = runLinters(repo, { pillar: "spec" });
    expect(report.issues.every((i) => i.linter === "lint:spec-tech-agnostic")).toBe(true);
  });
});
