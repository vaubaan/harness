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
  write(".gitignore", ".harness-overrides/\n.vaubaan/\n");
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

  describe("optional docs/journeys/ pillar", () => {
    const SPEC = `# System

## 0. Vocabulary

- **Source file** — what is written.
- **Artifact** — what is built.

## 1. Vision

Build things.
`;

    const JOURNEY = `---
title: Ship a thing
status: implemented
actors: [maintainer]
spec: ../spec/system.md
last_reviewed: 2026-11-09
---

# Ship a thing

As a maintainer, I ship.

## Write the source

creates: source-file
anchors: src/write.ts

## Build it

requires: source-file
creates: artifact
anchors: src/build.ts, src/*.ts
spec: ../spec/system.md#1-vision

## Sign it

status: proposed
requires: artifact
acceptance:
- The artifact is signed.
`;

    function bootstrapWithJourney(): void {
      bootstrapFullPassingRepo();
      write("docs/spec/system.md", SPEC);
      write("src/write.ts", "");
      write("src/build.ts", "");
      write("docs/journeys/ship.md", JOURNEY);
    }

    function journeyIssues(): Array<{ linter: string; severity: string }> {
      return runLinters(repo).issues.filter((i) => i.linter.startsWith("lint:journey-"));
    }

    it("stays green with a journey anchored to the code and a spec with a Vocabulary", () => {
      bootstrapWithJourney();
      const report = runLinters(repo);
      if (report.issues.length) console.log(JSON.stringify(report.issues, null, 2));
      expect(report.issues).toEqual([]);
    });

    it("lint:journey-schema fails on a broken grammar", () => {
      bootstrapWithJourney();
      write("docs/journeys/ship.md", JOURNEY.replace("creates: source-file\n", "uses: disk\n"));
      const report = runLinters(repo);
      expect(report.summary.pass).toBe(false);
      expect(journeyIssues().map((i) => i.linter)).toContain("lint:journey-schema");
    });

    it("lint:journey-anchors fails on an anchor that matches no file", () => {
      bootstrapWithJourney();
      write("docs/journeys/ship.md", JOURNEY.replace("src/write.ts", "src/gone.ts"));
      expect(runLinters(repo).summary.pass).toBe(false);
      expect(journeyIssues().map((i) => i.linter)).toEqual(["lint:journey-anchors"]);
    });

    it("lint:journey-vocabulary fails on an entity the spec does not define", () => {
      bootstrapWithJourney();
      write("docs/journeys/ship.md", JOURNEY.replace("creates: artifact", "creates: binary"));
      expect(runLinters(repo).summary.pass).toBe(false);
      expect(journeyIssues().map((i) => [i.linter, i.severity])).toContainEqual([
        "lint:journey-vocabulary",
        "error",
      ]);
    });

    it("lint:journey-graph warns, without failing, when nothing creates a required entity", () => {
      bootstrapWithJourney();
      write("docs/journeys/ship.md", JOURNEY.replace("creates: source-file\n", ""));
      const report = runLinters(repo);
      expect(report.summary.pass).toBe(true);
      expect(journeyIssues()).toMatchObject([
        { linter: "lint:journey-graph", severity: "warning" },
      ]);
    });

    it("--pillar=journeys runs only the journey linters and tracks-drift", () => {
      bootstrapWithJourney();
      write("docs/spec/x.md", "Uses React heavily.\n");
      write("docs/journeys/ship.md", JOURNEY.replace("src/write.ts", "src/gone.ts"));
      const report = runLinters(repo, { pillar: "journeys" });
      expect(report.issues.map((i) => i.linter)).toEqual(["lint:journey-anchors"]);
    });
  });
});
