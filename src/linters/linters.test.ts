import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adrNoTracks } from "./adr-no-tracks.js";
import { cardinalFiles } from "./cardinal-files.js";
import { crossLinks } from "./cross-links.js";
import { decisionSchema } from "./decision-schema.js";
import { docLayout } from "./doc-layout.js";
import { frontmatterTracks } from "./frontmatter-tracks.js";
import { gitignoreHarness } from "./gitignore-harness.js";
import { ALL_LINTERS, formatReportText, runLinters } from "./index.js";
import type { LintIssue, LintReport } from "./index.js";
import { orphanDecisions } from "./orphan-decisions.js";
import { qualitySchema } from "./quality-schema.js";
import { readmePresence } from "./readme-presence.js";
import { readmeSections } from "./readme-sections.js";
import { specHasContent } from "./spec-has-content.js";
import { specTechAgnostic } from "./spec-tech-agnostic.js";
import { tracksDrift } from "./tracks-drift.js";

class TempRepo {
  readonly root: string;
  constructor() {
    this.root = mkdtempSync(join(tmpdir(), "cah-test-"));
  }
  write(rel: string, content: string): void {
    const full = join(this.root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  mkdir(rel: string): void {
    mkdirSync(join(this.root, rel), { recursive: true });
  }
  initGit(): void {
    execSync("git init -q && git config user.email test@test && git config user.name test", {
      cwd: this.root,
    });
  }
  commit(message: string): void {
    execSync(`git add -A && git commit -q -m "${message}"`, { cwd: this.root });
  }
  cleanup(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}

let repo: TempRepo;
beforeEach(() => {
  repo = new TempRepo();
});
afterEach(() => {
  repo.cleanup();
});

describe("lint:readme-presence", () => {
  it("passes when README.md exists", () => {
    repo.write("README.md", "# Hi\n");
    expect(readmePresence.run(repo.root)).toEqual([]);
  });
  it("fails when README.md is missing", () => {
    const issues = readmePresence.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
  });
});

describe("lint:readme-sections", () => {
  it("passes when README has required sections", () => {
    repo.write(
      "README.md",
      `# Project

## What is this

Some intro.

## Quick start

Install + run.
`,
    );
    expect(readmeSections.run(repo.root)).toEqual([]);
  });
  it("fails when README is too thin", () => {
    repo.write("README.md", "just a sentence\n");
    const issues = readmeSections.run(repo.root);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("lint:doc-layout", () => {
  it("passes when all 5 dirs exist", () => {
    for (const d of [
      "docs/spec",
      "docs/decisions",
      "docs/handbook",
      "docs/tests",
      "docs/workflow",
    ]) {
      repo.mkdir(d);
    }
    expect(docLayout.run(repo.root)).toEqual([]);
  });
  it("flags each missing dir", () => {
    repo.mkdir("docs/spec");
    const issues = docLayout.run(repo.root);
    expect(issues).toHaveLength(4);
  });
});

describe("lint:cardinal-files", () => {
  it("passes when all 3 cardinal files exist", () => {
    repo.write("docs/tests/integration-tests.md", "x");
    repo.write("docs/tests/e2e-tests.md", "x");
    repo.write("docs/workflow/coding-workflow.md", "x");
    expect(cardinalFiles.run(repo.root)).toEqual([]);
  });
  it("flags missing cardinal files", () => {
    repo.write("docs/tests/integration-tests.md", "x");
    const issues = cardinalFiles.run(repo.root);
    expect(issues).toHaveLength(2);
  });
});

describe("lint:decision-schema", () => {
  it("passes when ADR has all 4 sections", () => {
    repo.write(
      "docs/decisions/0001-test.md",
      `# ADR

## Context

x

## Decision

x

## Consequences

x

## Rejected alternatives

x
`,
    );
    expect(decisionSchema.run(repo.root)).toEqual([]);
  });
  it("still accepts the French section headings", () => {
    repo.write(
      "docs/decisions/0001-test.md",
      "# ADR\n\n## Contexte\n\n## Décision\n\n## Conséquences\n\n## Alternatives rejetées\n",
    );
    expect(decisionSchema.run(repo.root)).toEqual([]);
  });
  it("flags ADR missing sections", () => {
    repo.write(
      "docs/decisions/0001-test.md",
      `# ADR

## Context

x

## Decision

x
`,
    );
    const issues = decisionSchema.run(repo.root);
    expect(issues.map((i) => i.message)).toEqual([
      'missing required section: "Consequences"',
      'missing required section: "Rejected alternatives"',
    ]);
  });
});

describe("lint:adr-no-tracks", () => {
  it("passes when ADR has no `tracks:` field", () => {
    repo.write(
      "docs/decisions/foo.md",
      `---
title: Foo
status: accepted
---

body.
`,
    );
    expect(adrNoTracks.run(repo.root)).toEqual([]);
  });
  it("passes when ADR has explicit empty `tracks: []`", () => {
    repo.write(
      "docs/decisions/foo.md",
      `---
title: Foo
status: accepted
tracks: []
---

body.
`,
    );
    expect(adrNoTracks.run(repo.root)).toEqual([]);
  });
  it("flags ADR with non-empty `tracks:`", () => {
    repo.write(
      "docs/decisions/foo.md",
      `---
title: Foo
status: accepted
tracks:
  - src/foo.ts
---

body.
`,
    );
    const issues = adrNoTracks.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toMatch(/must not declare `tracks:`/);
  });
  it("ignores docs outside docs/decisions/", () => {
    repo.write(
      "docs/handbook/foo.md",
      `---
tracks:
  - src/foo.ts
---

body.
`,
    );
    expect(adrNoTracks.run(repo.root)).toEqual([]);
  });
});

describe("lint:frontmatter-tracks", () => {
  it("passes when handbook has tracks: and paths exist", () => {
    repo.write("src/feature.ts", "// code");
    repo.write(
      "docs/handbook/feature.md",
      `---
tracks: [src/feature.ts]
---

Body.
`,
    );
    expect(frontmatterTracks.run(repo.root)).toEqual([]);
  });
  it("flags missing tracks field", () => {
    repo.write("docs/handbook/feature.md", "no frontmatter\n");
    const issues = frontmatterTracks.run(repo.root);
    expect(issues).toHaveLength(1);
  });
  it("flags non-existent tracked path", () => {
    repo.write(
      "docs/handbook/feature.md",
      `---
tracks: [src/gone.ts]
---

x
`,
    );
    const issues = frontmatterTracks.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/does not exist/);
  });
  it("passes when tracks entry is a glob pattern that resolves to existing files", () => {
    repo.write("src/lib/a.ts", "// a");
    repo.write("src/lib/b.ts", "// b");
    repo.write(
      "docs/handbook/feature.md",
      `---
tracks: [src/lib/*.ts]
---

Body.
`,
    );
    expect(frontmatterTracks.run(repo.root)).toEqual([]);
  });
  it("flags when tracks glob pattern resolves to no files", () => {
    repo.write("src/lib/a.ts", "// a");
    repo.write("src/lib/b.ts", "// b");
    repo.write(
      "docs/handbook/feature.md",
      `---
tracks: [src/lib/*.gone]
---

x
`,
    );
    const issues = frontmatterTracks.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/does not exist/);
  });
});

describe("lint:spec-tech-agnostic", () => {
  it("passes when spec has no tech keywords", () => {
    repo.write("docs/spec/system.md", "# System\n\nAbstract description.\n");
    expect(specTechAgnostic.run(repo.root)).toEqual([]);
  });
  it("flags forbidden tech keyword", () => {
    repo.write("docs/spec/system.md", "# System\n\nUses Next.js and Supabase.\n");
    const issues = specTechAgnostic.run(repo.root);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.some((i) => i.message.includes("Next.js"))).toBe(true);
    expect(issues.some((i) => i.message.includes("Supabase"))).toBe(true);
  });
});

describe("lint:spec-has-content", () => {
  it("passes when docs/spec/ has a markdown file", () => {
    repo.write("docs/spec/system.md", "# System\n");
    expect(specHasContent.run(repo.root)).toEqual([]);
  });
  it("warns when docs/spec/ dir exists but is empty", () => {
    repo.mkdir("docs/spec");
    const issues = specHasContent.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
    expect(issues[0]?.message).toMatch(/no markdown files/);
  });
  it("passes when docs/spec/ does not exist", () => {
    expect(specHasContent.run(repo.root)).toEqual([]);
  });
});

describe("lint:cross-links", () => {
  it("passes when links resolve", () => {
    repo.write("docs/target.md", "target");
    repo.write("docs/source.md", "[link](./target.md)");
    expect(crossLinks.run(repo.root)).toEqual([]);
  });
  it("flags broken link", () => {
    repo.write("docs/source.md", "[link](./gone.md)");
    const issues = crossLinks.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/broken/);
  });
  it("ignores external links", () => {
    repo.write("docs/source.md", "[link](https://example.com)");
    expect(crossLinks.run(repo.root)).toEqual([]);
  });
  it("ignores nested node_modules and dist", () => {
    repo.write("packages/app/node_modules/pkg/README.md", "[broken](./nope.md)");
    repo.write("packages/app/dist/README.md", "[broken](./nope.md)");
    expect(crossLinks.run(repo.root)).toEqual([]);
  });
  it("respects extra ignore from config", () => {
    repo.write("vendor/legacy/README.md", "[broken](./nope.md)");
    const ctx = { repoRoot: repo.root, config: { ignore: ["vendor/**"] } };
    expect(crossLinks.run(repo.root, ctx)).toEqual([]);
  });
});

describe("lint:orphan-decisions", () => {
  it("passes when ADR is referenced", () => {
    repo.write(
      "docs/decisions/0001-foo.md",
      "# ADR\n\n## Context\n## Decision\n## Consequences\n## Rejected alternatives\n",
    );
    repo.write("docs/spec/system.md", "See decision 0001-foo for details.\n");
    expect(orphanDecisions.run(repo.root)).toEqual([]);
  });
  it("warns when ADR is orphan", () => {
    repo.write("docs/decisions/0001-foo.md", "# ADR\n");
    repo.write("docs/spec/system.md", "Nothing references the ADR.\n");
    const issues = orphanDecisions.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
  });
  it("ignores references inside nested node_modules", () => {
    repo.write("docs/decisions/0001-foo.md", "# ADR\n");
    repo.write("packages/app/node_modules/pkg/docs.md", "See 0001-foo.\n");
    const issues = orphanDecisions.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
  });
});

describe("lint:gitignore-harness", () => {
  it("passes with harness entries and no retired runner entry", () => {
    repo.write(
      ".gitignore",
      ".harness-overrides/\n.harness-manifest.json\n.harness/\n.claude/\n.codex/\n.opencode/\n.agents/\n.vaubaan/\nAGENTS.md\nCLAUDE.md\n.mcp.json\n",
    );
    expect(gitignoreHarness.run(repo.root)).toEqual([]);
  });
  it("flags missing .gitignore", () => {
    const issues = gitignoreHarness.run(repo.root);
    expect(issues).toHaveLength(1);
  });
  it("flags missing entries", () => {
    repo.write(".gitignore", "node_modules/\n");
    const issues = gitignoreHarness.run(repo.root);
    expect(issues).toHaveLength(11);
  });
});

function mkReport(issues: LintIssue[]): LintReport {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  return { version: 1, summary: { errors, warnings, pass: errors === 0 }, issues };
}

describe("lint:quality-schema", () => {
  const completeQualityDoc = `# Code quality

## Mechanical checks

| Tool | Configuration |
|---|---|
| formatter | fmt.json |

## Project rules

- A rule.

## Accepted deviations

None.
`;

  it("passes when docs/quality/ is absent (optional pillar)", () => {
    expect(qualitySchema.run(repo.root)).toEqual([]);
  });
  it("passes when code-quality.md has the 3 cardinal sections", () => {
    repo.write("docs/quality/code-quality.md", completeQualityDoc);
    expect(qualitySchema.run(repo.root)).toEqual([]);
  });
  it("still accepts the French section headings, accented or not", () => {
    for (const doc of [
      "# Q\n\n## Vérifications mécaniques\n\n## Règles du projet\n\n## Écarts assumés\n",
      "# Q\n\n## Verifications mecaniques\n\n## Regles du projet\n\n## Ecarts assumes\n",
    ]) {
      repo.write("docs/quality/code-quality.md", doc);
      expect(qualitySchema.run(repo.root)).toEqual([]);
    }
  });
  it("flags docs/quality/ without its cardinal file", () => {
    repo.mkdir("docs/quality");
    const issues = qualitySchema.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.file).toBe("docs/quality/code-quality.md");
    expect(issues[0]?.message).toMatch(/missing required cardinal file/);
  });
  it("flags each missing cardinal section", () => {
    repo.write("docs/quality/code-quality.md", "# Q\n\n## Project rules\n\n- A rule.\n");
    const messages = qualitySchema.run(repo.root).map((i) => i.message);
    expect(messages).toEqual([
      'missing required section: "Mechanical checks"',
      'missing required section: "Accepted deviations"',
    ]);
  });
  it("does not accept a section title nested at a deeper heading level", () => {
    repo.write(
      "docs/quality/code-quality.md",
      completeQualityDoc.replace("## Accepted deviations", "### Accepted deviations"),
    );
    const issues = qualitySchema.run(repo.root);
    expect(issues.map((i) => i.message)).toEqual([
      'missing required section: "Accepted deviations"',
    ]);
  });
  it("is selected by --pillar=quality", () => {
    repo.mkdir("docs/quality");
    const report = runLinters(repo.root, { pillar: "quality", only: ["lint:quality-schema"] });
    expect(report.issues.map((i) => i.linter)).toEqual(["lint:quality-schema"]);
  });
});

describe("formatReportText", () => {
  it("empty report produces only summary line", () => {
    const out = formatReportText(mkReport([]));
    expect(out).toBe("\n0 errors, 0 warnings. ✔ CI passes.");
  });

  it("issue without line number omits colon-number", () => {
    const out = formatReportText(
      mkReport([
        {
          linter: "lint:readme-presence",
          severity: "error",
          file: "README.md",
          message: "missing README.md",
        },
      ]),
    );
    expect(out).toContain("README.md: error[lint:readme-presence]\n  missing README.md");
  });

  it("issue with line number includes :line in output", () => {
    const out = formatReportText(
      mkReport([
        {
          linter: "lint:spec-tech-agnostic",
          severity: "warning",
          file: "docs/spec.md",
          line: 42,
          message: "tech keyword found",
        },
      ]),
    );
    expect(out).toContain(
      "docs/spec.md:42: warning[lint:spec-tech-agnostic]\n  tech keyword found",
    );
  });

  it("issue with suggestedSkills shows → Try: hint", () => {
    const out = formatReportText(
      mkReport([
        {
          linter: "lint:decision-schema",
          severity: "error",
          file: "docs/decisions/foo.md",
          message: "missing sections",
        },
      ]),
    );
    expect(out).toContain("  → Try: /decision");
  });

  it("issue without suggestedSkills omits → Try: hint", () => {
    const out = formatReportText(
      mkReport([
        {
          linter: "lint:cross-links",
          severity: "error",
          file: "docs/source.md",
          message: "broken link",
        },
      ]),
    );
    expect(out).not.toContain("→ Try:");
  });

  it("singular counts use 'error' and 'warning'", () => {
    const out = formatReportText(
      mkReport([
        { linter: "lint:readme-presence", severity: "error", file: "README.md", message: "x" },
        { linter: "lint:doc-layout", severity: "warning", file: "docs/", message: "y" },
      ]),
    );
    expect(out).toContain("1 error, 1 warning. ✘ CI fails.");
  });

  it("plural counts use 'errors' and 'warnings'", () => {
    const out = formatReportText({
      version: 1,
      summary: { errors: 2, warnings: 3, pass: false },
      issues: [],
    });
    expect(out).toContain("2 errors, 3 warnings. ✘ CI fails.");
  });

  it("pass=true renders ✔ CI passes.", () => {
    const out = formatReportText(mkReport([]));
    expect(out).toContain("✔ CI passes.");
  });

  it("pass=false renders ✘ CI fails.", () => {
    const out = formatReportText(
      mkReport([
        { linter: "lint:readme-presence", severity: "error", file: "README.md", message: "x" },
      ]),
    );
    expect(out).toContain("✘ CI fails.");
  });

  it("multiple issues both appear in output", () => {
    const out = formatReportText(
      mkReport([
        { linter: "lint:readme-presence", severity: "error", file: "README.md", message: "x" },
        { linter: "lint:doc-layout", severity: "error", file: "docs/", message: "y" },
      ]),
    );
    expect(out).toContain("README.md");
    expect(out).toContain("docs/");
  });
});

describe("runLinters aggregator", () => {
  it("returns pass=true when no errors", () => {
    repo.write("README.md", "# Hi\n\n## What is this\n\nx\n\n## Quick start\n\nx\n");
    for (const d of [
      "docs/spec",
      "docs/decisions",
      "docs/handbook",
      "docs/tests",
      "docs/workflow",
    ]) {
      repo.mkdir(d);
    }
    repo.write("package.json", "{}");
    repo.write(
      "docs/tests/integration-tests.md",
      "---\ntracks: [package.json]\n---\n\nintegration tests",
    );
    repo.write("docs/tests/e2e-tests.md", "---\ntracks: [package.json]\n---\n\ne2e tests");
    repo.write("docs/workflow/coding-workflow.md", "---\ntracks: [package.json]\n---\n\nworkflow");
    repo.write(
      ".gitignore",
      ".harness-overrides/\n.harness-manifest.json\n.harness/\n.claude/\n.codex/\n.opencode/\n.agents/\n.vaubaan/\nAGENTS.md\nCLAUDE.md\n.mcp.json\n",
    );
    const report = runLinters(repo.root);
    if (!report.summary.pass) {
      console.log("Unexpected lint issues:", JSON.stringify(report.issues, null, 2));
    }
    expect(report.summary.pass).toBe(true);
    expect(report.summary.errors).toBe(0);
  });
  it("returns pass=false with errors aggregated", () => {
    const report = runLinters(repo.root);
    expect(report.summary.pass).toBe(false);
    expect(report.summary.errors).toBeGreaterThan(0);
  });
  it("filters by linter id via only", () => {
    const report = runLinters(repo.root, { only: ["lint:readme-presence"] });
    expect(report.issues.every((i) => i.linter === "lint:readme-presence")).toBe(true);
  });
  it("exposes ALL_LINTERS with 14 entries", () => {
    expect(ALL_LINTERS).toHaveLength(14);
  });
  it("wraps a linter crash in an error issue containing 'linter crashed:'", () => {
    const spy = vi.spyOn(readmePresence, "run").mockImplementation(() => {
      throw new Error("boom");
    });
    const report = runLinters(repo.root, { only: ["lint:readme-presence"] });
    spy.mockRestore();
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.severity).toBe("error");
    expect(report.issues[0]?.message).toContain("linter crashed:");
  });
  it("filters by pillar, excluding linters whose pillars do not match", () => {
    const report = runLinters(repo.root, { pillar: "readme" });
    expect(report.issues.some((i) => i.linter === "lint:readme-presence")).toBe(true);
    expect(report.issues.every((i) => i.linter !== "lint:gitignore-harness")).toBe(true);
  });
});

describe("lint:tracks-drift", () => {
  it("passes when no markdown exists in tracked dirs", () => {
    repo.initGit();
    repo.write("README.md", "# hello\n");
    repo.commit("init");
    expect(tracksDrift.run(repo.root)).toEqual([]);
  });

  it("passes when doc has no tracks: field in frontmatter", () => {
    repo.initGit();
    repo.write("docs/handbook/guide.md", "---\ntitle: guide\n---\n# Guide\n");
    repo.commit("init");
    expect(tracksDrift.run(repo.root)).toEqual([]);
  });

  it("passes when tracked file changed in exactly 10 commits (at threshold, not over)", () => {
    repo.initGit();
    repo.write("src/core.ts", "v0");
    repo.write(
      "docs/handbook/guide.md",
      "---\ntitle: guide\ntracks:\n  - src/core.ts\n---\n# Guide\n",
    );
    repo.commit("init");
    for (let i = 1; i <= 10; i++) {
      repo.write("src/core.ts", `v${i}`);
      repo.commit(`update core ${i}`);
    }
    expect(tracksDrift.run(repo.root)).toEqual([]);
  });

  it("flags doc when tracked file changed in >10 commits since doc last edit", () => {
    repo.initGit();
    repo.write("src/core.ts", "v0");
    repo.write(
      "docs/handbook/guide.md",
      "---\ntitle: guide\ntracks:\n  - src/core.ts\n---\n# Guide\n",
    );
    repo.commit("init");
    for (let i = 1; i <= 11; i++) {
      repo.write("src/core.ts", `v${i}`);
      repo.commit(`update core ${i}`);
    }
    const issues = tracksDrift.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.linter).toBe("lint:tracks-drift");
    expect(issues[0]?.severity).toBe("warning");
    expect(issues[0]?.file).toBe("docs/handbook/guide.md");
    expect(issues[0]?.message).toContain("11 commits");
    expect(issues[0]?.message).toContain("threshold 10");
  });

  it("accumulates drift across all files matched by a glob pattern", () => {
    repo.initGit();
    repo.mkdir("src/lib");
    repo.write("src/lib/a.ts", "v0");
    repo.write("src/lib/b.ts", "v0");
    repo.write(
      "docs/handbook/guide.md",
      "---\ntitle: guide\ntracks:\n  - src/lib/*.ts\n---\n# Guide\n",
    );
    repo.commit("init");
    for (let i = 1; i <= 6; i++) {
      repo.write("src/lib/a.ts", `a${i}`);
      repo.write("src/lib/b.ts", `b${i}`);
      repo.commit(`update lib ${i}`);
    }
    // 6 commits × 2 files = 12 total drift count, over threshold 10
    const issues = tracksDrift.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("12 commits");
  });

  it("checks docs/tests and docs/workflow dirs in addition to docs/handbook", () => {
    repo.initGit();
    repo.write("src/core.ts", "v0");
    repo.write(
      "docs/tests/integration.md",
      "---\ntitle: integration\ntracks:\n  - src/core.ts\n---\n# Tests\n",
    );
    repo.commit("init");
    for (let i = 1; i <= 11; i++) {
      repo.write("src/core.ts", `v${i}`);
      repo.commit(`update core ${i}`);
    }
    const issues = tracksDrift.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.file).toBe("docs/tests/integration.md");
  });

  it("ignores docs outside tracked dirs (e.g. docs/decisions)", () => {
    repo.initGit();
    repo.write("src/core.ts", "v0");
    repo.write(
      "docs/decisions/adr-001.md",
      "---\ntitle: adr\ntracks:\n  - src/core.ts\n---\n# ADR\n",
    );
    repo.commit("init");
    for (let i = 1; i <= 11; i++) {
      repo.write("src/core.ts", `v${i}`);
      repo.commit(`update core ${i}`);
    }
    expect(tracksDrift.run(repo.root)).toEqual([]);
  });

  describe("with custom driftThreshold", () => {
    it("passes when drift is under a custom driftThreshold in frontmatter", () => {
      repo.initGit();
      repo.write("src/core.ts", "v0");
      repo.write(
        "docs/handbook/guide.md",
        "---\ntitle: guide\ntracks:\n  - src/core.ts\ndriftThreshold: 3\n---\n# Guide\n",
      );
      repo.commit("init");
      for (let i = 1; i <= 3; i++) {
        repo.write("src/core.ts", `v${i}`);
        repo.commit(`update core ${i}`);
      }
      // drift=3, driftThreshold=3: condition is > not >=, so should pass
      expect(tracksDrift.run(repo.root)).toEqual([]);
    });

    it("flags when drift exceeds a custom driftThreshold lower than default", () => {
      repo.initGit();
      repo.write("src/core.ts", "v0");
      repo.write(
        "docs/handbook/guide.md",
        "---\ntitle: guide\ntracks:\n  - src/core.ts\ndriftThreshold: 3\n---\n# Guide\n",
      );
      repo.commit("init");
      for (let i = 1; i <= 4; i++) {
        repo.write("src/core.ts", `v${i}`);
        repo.commit(`update core ${i}`);
      }
      // drift=4 > driftThreshold=3, should warn
      const issues = tracksDrift.run(repo.root);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toContain("4 commits");
      expect(issues[0]?.message).toContain("threshold 3");
    });
  });
});
