import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadHarness } from "../../src/loader.js";
import { ADDABLE_PILLARS } from "../../src/pillars.js";
import { VERSION } from "../../src/version.js";

const harness = loadHarness(resolve(__dirname, "..", "..", "src"));
const skill = (id: string) => {
  const found = harness.skills.find((s) => s.meta.id === id);
  if (!found) throw new Error(`missing shipped skill: ${id}`);
  return found;
};

describe("harness-zero", () => {
  const zero = skill("harness-zero");

  it("is always rendered: it serves no pillar in particular", () => {
    expect(zero.meta.pillars).toBeUndefined();
  });

  it("names, for every pillar that can be added, the command that adds it", () => {
    for (const pillar of ADDABLE_PILLARS) {
      expect(zero.body, pillar.id).toContain(`npx @vaubaan/harness add ${pillar.id}`);
    }
  });

  it("has the agent propose a pillar and leaves the decision to the human", () => {
    expect(zero.body).toMatch(/the human decides/);
    expect(zero.body).toMatch(/never create its folder yourself/);
  });
});

describe("harness-upgrade", () => {
  const upgrade = skill("harness-upgrade");
  const entries = [...upgrade.body.matchAll(/^### (.+)$/gm)]
    .flatMap((m) => (m[1] ?? "").split(","))
    .map((v) => v.trim())
    .filter((v) => /^\d+\.\d+/.test(v))
    .map((v) => v.split(".").map(Number) as [number, number]);

  it("is always rendered and has its command", () => {
    expect(upgrade.meta.pillars).toBeUndefined();
    expect(harness.cmds.find((c) => c.meta.invokes_skill === "harness-upgrade")?.meta.trigger).toBe(
      "/harness-upgrade",
    );
  });

  // The release procedure adds the entry (docs/workflow/coding-workflow.md §5):
  // this fails on a minor bump that forgot it, even to say "nothing to do".
  it("holds a migration entry for the current minor version, or a later one", () => {
    const [major, minor] = VERSION.split(".").map(Number) as [number, number];
    const covered = entries.some(([M, m]) => M > major || (M === major && m >= minor));
    expect(covered, `no migration entry for ${major}.${minor} in harness-upgrade`).toBe(true);
  });

  it("lists its entries newest first", () => {
    const keys = entries.map(([M, m]) => M * 1000 + m);
    expect(keys).toEqual([...keys].sort((a, b) => b - a));
  });
});
