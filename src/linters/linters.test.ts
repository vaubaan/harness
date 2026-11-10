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
import { journeyAnchors } from "./journey-anchors.js";
import { journeyGraph } from "./journey-graph.js";
import { journeySchema } from "./journey-schema.js";
import { entitySlug, journeyVocabulary, vocabularyOf } from "./journey-vocabulary.js";
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
  it("ignores links in fenced code blocks and inline code", () => {
    repo.write(
      "docs/source.md",
      "```md\n[broken](./nope.md)\n```\n\nSee `[broken](./nope.md)` here.\n",
    );
    expect(crossLinks.run(repo.root)).toEqual([]);
  });
  it("ignores anchor and mailto links", () => {
    repo.write("docs/source.md", "[a](#section) and [m](mailto:someone@example.com)\n");
    expect(crossLinks.run(repo.root)).toEqual([]);
  });
  it("strips the fragment before resolving the target", () => {
    repo.write("docs/target.md", "target");
    repo.write("docs/source.md", "[ok](./target.md#section)\n[ko](./gone.md#section)\n");
    const issues = crossLinks.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toBe("broken link: ./gone.md#section");
  });
  it("resolves links starting with / from the repo root", () => {
    repo.write("docs/target.md", "target");
    repo.write("docs/sub/source.md", "[ok](/docs/target.md)\n[ko](/docs/gone.md)\n");
    const issues = crossLinks.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toBe("broken link: /docs/gone.md");
  });
  it("ignores data: links", () => {
    repo.write("docs/source.md", "[img](data:image/png;base64,iVBORw0KGgo=)\n");
    expect(crossLinks.run(repo.root)).toEqual([]);
  });
  it("reports file, line and message of a broken link", () => {
    repo.write("docs/source.md", "# Title\n\n[link](./gone.md)\n");
    expect(crossLinks.run(repo.root)).toEqual([
      {
        linter: "lint:cross-links",
        severity: "error",
        file: "docs/source.md",
        line: 3,
        message: "broken link: ./gone.md",
      },
    ]);
  });
  it("reports each broken link on the same line", () => {
    repo.write("docs/source.md", "[a](./gone-a.md) and [b](./gone-b.md)\n");
    const issues = crossLinks.run(repo.root);
    expect(issues.map((i) => i.message)).toEqual([
      "broken link: ./gone-a.md",
      "broken link: ./gone-b.md",
    ]);
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
  it("passes when only the local state is ignored", () => {
    repo.write(".gitignore", "node_modules/\n.harness-overrides/\n.vaubaan/\n");
    expect(gitignoreHarness.run(repo.root)).toEqual([]);
  });
  it("accepts entries without a trailing slash, with a leading slash, and ignores comments", () => {
    repo.write(".gitignore", "# state\n/.harness-overrides\n.vaubaan\n");
    expect(gitignoreHarness.run(repo.root)).toEqual([]);
  });
  it("flags missing .gitignore", () => {
    const issues = gitignoreHarness.run(repo.root);
    expect(issues).toHaveLength(1);
  });
  it("flags missing entries", () => {
    repo.write(".gitignore", "node_modules/\n");
    const issues = gitignoreHarness.run(repo.root);
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.message)).toEqual([
      '.gitignore must contain ".harness-overrides/"',
      '.gitignore must contain ".vaubaan/"',
    ]);
  });
  it("flags generated files that are ignored: they must be committed", () => {
    repo.write(".gitignore", ".harness-overrides/\n.vaubaan/\n.claude/\nAGENTS.md\n");
    const issues = gitignoreHarness.run(repo.root);
    expect(issues).toHaveLength(2);
    expect(issues[0]?.severity).toBe("error");
    expect(issues.map((i) => i.message)).toEqual([
      '.gitignore must not contain "AGENTS.md": files the harness generates are committed',
      '.gitignore must not contain ".claude/": files the harness generates are committed',
    ]);
  });
  it("flags an ignored journeys index: it is a generated file", () => {
    repo.write(".gitignore", ".harness-overrides/\n.vaubaan/\n/docs/journeys/README.md\n");
    expect(gitignoreHarness.run(repo.root).map((i) => i.message)).toEqual([
      '.gitignore must not contain "docs/journeys/README.md": files the harness generates are committed',
    ]);
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
    repo.write(".gitignore", ".harness-overrides/\n.vaubaan/\n");
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
  it("exposes ALL_LINTERS with 19 entries, the journey linters before generated-fresh, last", () => {
    expect(ALL_LINTERS).toHaveLength(19);
    expect(ALL_LINTERS.slice(13).map((l) => l.id)).toEqual([
      "lint:quality-schema",
      "lint:journey-schema",
      "lint:journey-anchors",
      "lint:journey-vocabulary",
      "lint:journey-graph",
      "lint:generated-fresh",
    ]);
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

const JOURNEY_FM = `---
title: Ship a thing
status: implemented
actors: [maintainer]
spec: ../spec/system.md
last_reviewed: 2026-11-09
---
`;

const SPEC_WITH_VOCABULARY = `# System

## 1. Vocabulary

- **Source file** — what is written.
- **Artifact** — what is built.
  - **Signed artifact** — nested terms count too.

## 2. Vision

- **Not a term** — outside the section.
`;

function writeJourney(body: string, fm = JOURNEY_FM, name = "ship.md"): void {
  repo.write(
    `docs/journeys/${name}`,
    `${fm}\n# Ship a thing\n\nAs a maintainer, I ship.\n\n${body}`,
  );
}

/** Line of the first heading of `body` in a journey written by `writeJourney`. */
const FIRST_NODE_LINE = 13;

describe("lint:journey-schema", () => {
  beforeEach(() => {
    repo.write("docs/spec/system.md", SPEC_WITH_VOCABULARY);
    repo.write("src/a.ts", "");
  });

  it("is a no-op without docs/journeys/", () => {
    expect(journeySchema.run(repo.root)).toEqual([]);
  });
  it("passes a well-formed journey", () => {
    writeJourney(
      "## Build\n\nOne sentence of story.\n\n### Compile\n\nanchors: src/a.ts\nspec: ../spec/system.md#2-vision\n\n### Sign\n\nstatus: proposed\nacceptance:\n- It is signed.\n\n## Retire\n\nstatus: deprecated\nrequires: artifact\n",
    );
    expect(journeySchema.run(repo.root)).toEqual([]);
  });
  it("reports frontmatter errors", () => {
    writeJourney(
      "## Story\n\nanchors: src/a.ts\n",
      "---\ntitle: X\nstatus: done\ntracks: [a]\n---\n",
    );
    const messages = journeySchema.run(repo.root).map((i) => i.message);
    expect(messages.some((m) => /`status`/.test(m))).toBe(true);
    expect(messages.some((m) => /tracks/.test(m))).toBe(true);
    expect(messages.some((m) => /`actors`/.test(m))).toBe(true);
  });
  it("reports unknown and derivable fields at their line", () => {
    writeJourney("## Story\n\nanchors: src/a.ts\nowner: me\nuses: db\n");
    const issues = journeySchema.run(repo.root);
    expect(issues.map((i) => [i.line, i.message])).toEqual([
      [FIRST_NODE_LINE + 3, '"Story": unknown field `owner:`'],
      [FIRST_NODE_LINE + 4, '"Story": `uses:` is derivable, never declared'],
    ]);
  });
  it("reports a story field on an internal node", () => {
    writeJourney("## Build\n\nanchors: src/a.ts\n\n### Compile\n\nanchors: src/a.ts\n");
    const issues = journeySchema.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "error", line: FIRST_NODE_LINE + 2 });
    expect(issues[0]?.message).toMatch(/`anchors:` is a story field/);
  });
  it("reports a story without any field", () => {
    writeJourney("## Story\n\nJust prose.\n");
    const issues = journeySchema.run(repo.root);
    expect(issues.map((i) => [i.line, i.message])).toEqual([
      [FIRST_NODE_LINE, '"Story": a story carries at least one field'],
    ]);
  });
  it("reports an implemented story without anchors and a proposed story without acceptance", () => {
    writeJourney("## Built\n\nrequires: artifact\n\n## Planned\n\nstatus: proposed\nacceptance:\n");
    const messages = journeySchema.run(repo.root).map((i) => i.message);
    expect(messages).toEqual([
      '"Built": an `implemented` story needs `anchors:`',
      '"Planned": a `proposed` story needs `acceptance:` with at least one `- ` item',
    ]);
  });
  it("reports spec paths that do not resolve, frontmatter and node", () => {
    writeJourney(
      "## Story\n\nanchors: src/a.ts\nspec: ../spec/missing.md#x\n",
      JOURNEY_FM.replace("spec: ../spec/system.md", "spec: [../spec/system.md, ../spec/gone.md]"),
    );
    const messages = journeySchema.run(repo.root).map((i) => i.message);
    expect(messages).toEqual([
      "frontmatter `spec` does not resolve: ../spec/gone.md",
      '"Story": `spec:` does not resolve: ../spec/missing.md#x',
    ]);
  });
  it("reports an invalid node status", () => {
    writeJourney("## Story\n\nstatus: shipped\nanchors: src/a.ts\n");
    const issues = journeySchema.run(repo.root);
    expect(issues.map((i) => i.line)).toEqual([FIRST_NODE_LINE + 2]);
    expect(issues[0]?.message).toMatch(/invalid status `shipped`/);
  });
});

describe("lint:journey-anchors", () => {
  it("is a no-op without docs/journeys/", () => {
    expect(journeyAnchors.run(repo.root)).toEqual([]);
  });
  it("passes when every anchor, path or glob, matches a file", () => {
    repo.write("src/a.ts", "");
    repo.write("src/lib/b.ts", "");
    writeJourney("## Story\n\nanchors: src/a.ts, src/lib/*.ts\n");
    expect(journeyAnchors.run(repo.root)).toEqual([]);
  });
  it("reports each missing anchor at the node line, skipping deprecated nodes", () => {
    repo.write("src/a.ts", "");
    writeJourney(
      "## Story\n\nanchors: src/a.ts, src/gone.ts, src/none/*.ts\n\n## Old\n\nstatus: deprecated\nanchors: src/removed.ts\n",
    );
    const issues = journeyAnchors.run(repo.root);
    expect(issues.map((i) => [i.severity, i.line, i.message])).toEqual([
      ["error", FIRST_NODE_LINE, '"Story": anchor matches no file: src/gone.ts'],
      ["error", FIRST_NODE_LINE, '"Story": anchor matches no file: src/none/*.ts'],
    ]);
  });
});

describe("lint:journey-vocabulary", () => {
  it("slugs a term and reads only the Vocabulary section", () => {
    expect(entitySlug("Generated file")).toBe("generated-file");
    expect(entitySlug("  C++ / API key ")).toBe("c-api-key");
    expect([...(vocabularyOf(SPEC_WITH_VOCABULARY) ?? [])]).toEqual([
      "source-file",
      "artifact",
      "signed-artifact",
    ]);
    expect(vocabularyOf("# S\n\n## Vocabulaire\n\n* **Fichier** — x\n")).toEqual(
      new Set(["fichier"]),
    );
    expect(vocabularyOf("# S\n\n## Vision\n\n- **Term** — x\n")).toBeUndefined();
  });
  it("is a no-op without docs/journeys/", () => {
    expect(journeyVocabulary.run(repo.root)).toEqual([]);
  });
  it("passes when every entity is a Vocabulary term of a linked spec", () => {
    repo.write("docs/spec/system.md", SPEC_WITH_VOCABULARY);
    writeJourney("## Story\n\nrequires: source-file\ncreates: artifact, signed-artifact\n");
    expect(journeyVocabulary.run(repo.root)).toEqual([]);
  });
  it("reports an entity outside the Vocabulary at the node line", () => {
    repo.write("docs/spec/system.md", SPEC_WITH_VOCABULARY);
    writeJourney("## Story\n\nrequires: source-files\ncreates: not-a-term\n");
    const issues = journeyVocabulary.run(repo.root);
    expect(issues.map((i) => [i.severity, i.line])).toEqual([
      ["error", FIRST_NODE_LINE],
      ["error", FIRST_NODE_LINE],
    ]);
    expect(issues[0]?.message).toMatch(/entity `source-files` is not a Vocabulary term/);
  });
  it("downgrades to one warning when no linked spec has a Vocabulary section", () => {
    repo.write("docs/spec/system.md", "# System\n\n## Vision\n\nText.\n");
    writeJourney("## A\n\nrequires: x\n\n## B\n\ncreates: y\n");
    const issues = journeyVocabulary.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "warning", file: "docs/journeys/ship.md" });
    expect(issues[0]?.message).toBe(
      "no Vocabulary section in docs/spec/system.md; entities not checked",
    );
  });
});

describe("lint:journey-graph", () => {
  it("is a no-op without docs/journeys/", () => {
    expect(journeyGraph.run(repo.root)).toEqual([]);
  });
  it("passes when every required entity is created by a story of any journey", () => {
    writeJourney("## Make\n\ncreates: artifact\n", JOURNEY_FM, "a.md");
    writeJourney("## Use\n\nrequires: artifact\n", JOURNEY_FM, "b.md");
    expect(journeyGraph.run(repo.root)).toEqual([]);
  });
  it("warns at the node line when nothing creates a required entity", () => {
    writeJourney("## Use\n\nrequires: artifact, source-file\n\n## Make\n\ncreates: source-file\n");
    const issues = journeyGraph.run(repo.root);
    expect(issues.map((i) => [i.severity, i.line, i.message])).toEqual([
      [
        "warning",
        FIRST_NODE_LINE,
        '"Use": entity `artifact` is required here but no story creates it',
      ],
    ]);
  });
});

describe("lint:tracks-drift on journeys", () => {
  it("treats the union of a journey's anchors as its tracked paths", () => {
    repo.initGit();
    repo.write("src/a.ts", "v0");
    repo.write("src/b.ts", "v0");
    writeJourney("## A\n\nanchors: src/a.ts\n\n## B\n\nanchors: src/b.ts, src/a.ts\n");
    repo.commit("init");
    for (let i = 1; i <= 6; i++) {
      repo.write("src/a.ts", `a${i}`);
      repo.write("src/b.ts", `b${i}`);
      repo.commit(`update ${i}`);
    }
    const issues = tracksDrift.run(repo.root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.file).toBe("docs/journeys/ship.md");
    expect(issues[0]?.message).toContain("12 commits");
  });
  it("ignores a journey without anchors and the generated index", () => {
    repo.initGit();
    repo.write("src/a.ts", "v0");
    writeJourney("## A\n\nstatus: proposed\nacceptance:\n- x\n");
    repo.write("docs/journeys/README.md", "# Journeys\n\nanchors: src/a.ts\n");
    repo.commit("init");
    for (let i = 1; i <= 11; i++) {
      repo.write("src/a.ts", `a${i}`);
      repo.commit(`update ${i}`);
    }
    expect(tracksDrift.run(repo.root)).toEqual([]);
  });
  it("is selected by --pillar=journeys with the four journey linters", () => {
    const ids = ALL_LINTERS.filter((l) => l.pillars.includes("journeys")).map((l) => l.id);
    expect(ids).toEqual([
      "lint:tracks-drift",
      "lint:journey-schema",
      "lint:journey-anchors",
      "lint:journey-vocabulary",
      "lint:journey-graph",
    ]);
  });
});
