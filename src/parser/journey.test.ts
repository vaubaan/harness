import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadJourneys, maskFencedCode, parseJourney, readJourneys } from "./journey.js";

const FRONTMATTER = `---
title: Ship a thing
status: implemented
actors: [maintainer, agent]
spec: ../spec/system.md
last_reviewed: 2026-11-09
---
`;

const JOURNEY = `${FRONTMATTER}
# Ship a thing

As a maintainer, I want to ship
so that users get it.

## Build it

As a maintainer, I build.

### Compile

requires: source
creates: artifact
anchors: src/a.ts, src/b.ts

### Package

status: proposed

acceptance:
- The package is signed.
- The package is small.

## Publish it

anchors: src/publish.ts
spec: ../spec/system.md#publish
`;

describe("parseJourney", () => {
  it("parses the frontmatter, the title and the story", () => {
    const j = parseJourney("docs/journeys/ship.md", JOURNEY);
    expect(j.errors).toEqual([]);
    expect(j.meta?.status).toBe("implemented");
    expect(j.meta?.actors).toEqual(["maintainer", "agent"]);
    expect(j.meta?.last_reviewed).toBeInstanceOf(Date);
    expect(j.title).toBe("Ship a thing");
    expect(j.story).toBe("As a maintainer, I want to ship so that users get it.");
  });

  it("builds the tree by heading depth, with lines, terminal intents and parents", () => {
    const j = parseJourney("docs/journeys/ship.md", JOURNEY);
    expect(j.nodes.map((n) => [n.title, n.level, n.isTerminal, n.parent])).toEqual([
      ["Build it", 1, false, undefined],
      ["Compile", 2, true, 0],
      ["Package", 2, true, 0],
      ["Publish it", 1, true, undefined],
    ]);
    expect(j.nodes[0]?.line).toBe(14);
    expect(j.nodes[1]?.line).toBe(18);
  });

  it("reads the fields, comma-separated lists and acceptance items", () => {
    const [, compile, pack, publish] = parseJourney("docs/journeys/ship.md", JOURNEY).nodes;
    expect(compile?.requires).toEqual(["source"]);
    expect(compile?.creates).toEqual(["artifact"]);
    expect(compile?.anchors).toEqual(["src/a.ts", "src/b.ts"]);
    expect(compile?.fieldLines).toEqual({ requires: 20, creates: 21, anchors: 22 });
    expect(pack?.acceptance).toEqual(["The package is signed.", "The package is small."]);
    expect(publish?.spec).toBe("../spec/system.md#publish");
  });

  it("an internal node's prose ends its field block", () => {
    const [build] = parseJourney("docs/journeys/ship.md", JOURNEY).nodes;
    expect(build?.fieldLines).toEqual({});
  });

  it("resolves the effective status: nearest status up the tree, else the file's", () => {
    const text = JOURNEY.replace("## Build it\n", "## Build it\n\nstatus: deprecated\n");
    const nodes = parseJourney("docs/journeys/ship.md", text).nodes;
    expect(nodes.map((n) => n.effectiveStatus)).toEqual([
      "deprecated",
      "deprecated",
      "proposed",
      "implemented",
    ]);
  });

  it("records unknown fields and ends the block at a list item outside acceptance", () => {
    const text = `${FRONTMATTER}\n# T\n\n## Intent\n\nuses: db\nanchors: a.ts\n- stray\nguards: admin\n`;
    const [intent] = parseJourney("x.md", text).nodes;
    expect(intent?.unknownFields).toEqual([{ key: "uses", line: 13 }]);
    expect(intent?.anchors).toEqual(["a.ts"]);
  });

  it("ignores headings and fields in fenced code", () => {
    const text = `${FRONTMATTER}\n# T\n\n## Intent\n\nanchors: a.ts\n\n\`\`\`md\n## Not a node\nrequires: x\n\`\`\`\n`;
    const j = parseJourney("x.md", text);
    expect(j.nodes.map((n) => n.title)).toEqual(["Intent"]);
    expect(j.nodes[0]?.requires).toEqual([]);
  });

  it("collects frontmatter errors without throwing and still parses the nodes", () => {
    const text = `---\ntitle: ""\nstatus: done\nactors: []\nowner: me\n---\n\n# T\n\n## Intent\n\nanchors: a.ts\n`;
    const j = parseJourney("x.md", text);
    expect(j.meta).toBeUndefined();
    const messages = j.errors.map((e) => e.message).join("\n");
    expect(messages).toMatch(/`title`/);
    expect(messages).toMatch(/`status`/);
    expect(messages).toMatch(/`actors`/);
    expect(messages).toMatch(/`spec`/);
    expect(messages).toMatch(/`last_reviewed`/);
    expect(messages).toMatch(/owner/);
    expect(j.nodes).toHaveLength(1);
    expect(j.title).toBe("T");
  });

  it("accepts a list of specs and a quoted date", () => {
    const text = FRONTMATTER.replace("spec: ../spec/system.md", "spec: [a.md, b.md]").replace(
      "2026-11-09",
      '"2026-11-09"',
    );
    const j = parseJourney("x.md", text);
    expect(j.errors).toEqual([]);
    expect(j.meta?.spec).toEqual(["a.md", "b.md"]);
    expect(j.meta?.last_reviewed).toBe("2026-11-09");
  });

  it("reports invalid YAML and an invalid node status", () => {
    expect(parseJourney("x.md", "---\ntitle: [\n---\n# T\n").errors[0]?.message).toMatch(
      /invalid frontmatter YAML/,
    );
    const j = parseJourney("x.md", `${FRONTMATTER}\n# T\n\n## Intent\n\nstatus: done\n`);
    expect(j.errors).toEqual([
      { line: 13, message: expect.stringMatching(/invalid status `done`/) },
    ]);
    expect(j.nodes[0]?.effectiveStatus).toBe("implemented");
  });
});

describe("maskFencedCode", () => {
  it("masks fences and their content, keeping the line count", () => {
    const masked = maskFencedCode(["a", "~~~", "# x", "~~~", "b"]);
    expect(masked).toHaveLength(5);
    expect(masked[0]).toBe("a");
    expect(masked[2]).not.toBe("# x");
    expect(masked[4]).toBe("b");
  });
});

describe("loadJourneys", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cah-journeys-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const write = (rel: string, content: string): void => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  };

  it("returns [] when docs/journeys/ is absent", () => {
    expect(loadJourneys(root)).toEqual([]);
  });

  it("reads the journeys sorted by file name, skipping the index", () => {
    write("docs/journeys/z-last.md", JOURNEY);
    write("docs/journeys/a-first.md", JOURNEY);
    write("docs/journeys/README.md", "# Journeys\n");
    write("docs/journeys/notes.txt", "x");
    const journeys = loadJourneys(root);
    expect(journeys.map((j) => j.path)).toEqual([
      "docs/journeys/a-first.md",
      "docs/journeys/z-last.md",
    ]);
    expect(journeys[0]?.file).toBe("a-first.md");
  });

  it("throws listing every problem when a journey does not parse; readJourneys does not", () => {
    write("docs/journeys/bad.md", "---\ntitle: Bad\n---\n# Bad\n\n## Intent\n\nstatus: done\n");
    expect(() => loadJourneys(root)).toThrow(/docs\/journeys\/bad\.md:1: frontmatter `status`/);
    expect(() => loadJourneys(root)).toThrow(/docs\/journeys\/bad\.md:8: invalid status/);
    expect(readJourneys(root)[0]?.errors.length).toBeGreaterThan(0);
  });
});
