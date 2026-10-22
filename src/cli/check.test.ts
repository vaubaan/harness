import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkCommand } from "./check.js";

const REQUIRED_GITIGNORE_ENTRIES = [
  ".harness-overrides/",
  ".harness-manifest.json",
  ".harness/",
  ".claude/",
  ".codex/",
  ".opencode/",
  ".agents/",
  ".vaubaan/",
  "AGENTS.md",
  "CLAUDE.md",
];

const REQUIRED_DIRS = [
  "docs/spec",
  "docs/decisions",
  "docs/handbook",
  "docs/tests",
  "docs/workflow",
];

let repo: string;

function write(rel: string, content = "") {
  writeFileSync(join(repo, rel), content, "utf8");
}

function mkdir(rel: string) {
  mkdirSync(join(repo, rel), { recursive: true });
}

function scaffoldFullRepo() {
  write("README.md", "# test");
  for (const d of REQUIRED_DIRS) mkdir(d);
  write(".gitignore", `${REQUIRED_GITIGNORE_ENTRIES.join("\n")}\n`);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "cah-check-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("checkCommand", () => {
  it("passes on a fully bootstrapped repo without retired runner conventions", () => {
    scaffoldFullRepo();
    const result = checkCommand(repo);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails when README.md is missing", () => {
    scaffoldFullRepo();
    rmSync(join(repo, "README.md"));
    const result = checkCommand(repo);
    expect(result.pass).toBe(false);
    expect(result.issues).toContain("README.md missing at repo root");
  });

  it("fails when a required directory is missing", () => {
    scaffoldFullRepo();
    rmSync(join(repo, "docs/spec"), { recursive: true });
    const result = checkCommand(repo);
    expect(result.pass).toBe(false);
    expect(result.issues).toContain("missing directory: docs/spec/");
  });

  it("reports all missing required directories", () => {
    scaffoldFullRepo();
    for (const d of REQUIRED_DIRS) rmSync(join(repo, d), { recursive: true });
    const result = checkCommand(repo);
    for (const d of REQUIRED_DIRS) {
      expect(result.issues).toContain(`missing directory: ${d}/`);
    }
  });

  it("fails when .gitignore is missing", () => {
    scaffoldFullRepo();
    rmSync(join(repo, ".gitignore"));
    const result = checkCommand(repo);
    expect(result.pass).toBe(false);
    expect(result.issues).toContain(".gitignore missing at repo root");
  });

  it("fails when .gitignore is missing a required entry", () => {
    scaffoldFullRepo();
    // Write gitignore without ".harness-overrides/"
    const entries = REQUIRED_GITIGNORE_ENTRIES.filter((e) => e !== ".harness-overrides/");
    write(".gitignore", `${entries.join("\n")}\n`);
    const result = checkCommand(repo);
    expect(result.pass).toBe(false);
    expect(result.issues).toContain(".gitignore missing entry: .harness-overrides/");
  });

  it("accepts trailing-slash variant stripped — entry without slash passes", () => {
    scaffoldFullRepo();
    // Replace ".harness-overrides/" with ".harness-overrides" (no trailing slash) — should still be accepted
    const entries = REQUIRED_GITIGNORE_ENTRIES.map((e) =>
      e === ".harness-overrides/" ? ".harness-overrides" : e,
    );
    write(".gitignore", `${entries.join("\n")}\n`);
    const result = checkCommand(repo);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("accepts trailing-slash variant stripped for all directory-style entries", () => {
    scaffoldFullRepo();
    // Strip trailing slash from all entries that have one
    const entries = REQUIRED_GITIGNORE_ENTRIES.map((e) => e.replace(/\/$/, ""));
    write(".gitignore", `${entries.join("\n")}\n`);
    const result = checkCommand(repo);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("reports multiple gitignore missing entries at once", () => {
    scaffoldFullRepo();
    // Only keep the first entry
    write(".gitignore", `${REQUIRED_GITIGNORE_ENTRIES[0]}\n`);
    const result = checkCommand(repo);
    expect(result.pass).toBe(false);
    const missingEntries = REQUIRED_GITIGNORE_ENTRIES.slice(1);
    for (const entry of missingEntries) {
      expect(result.issues).toContain(`.gitignore missing entry: ${entry}`);
    }
  });

  it("reports all issues on an empty repo", () => {
    const result = checkCommand(repo);
    expect(result.pass).toBe(false);
    expect(result.issues).toContain("README.md missing at repo root");
    expect(result.issues).toContain(".gitignore missing at repo root");
    for (const d of REQUIRED_DIRS) {
      expect(result.issues).toContain(`missing directory: ${d}/`);
    }
  });

  it("does not report gitignore entry issues when .gitignore is absent", () => {
    // When .gitignore is missing entirely, we should see the "missing" issue
    // but NOT per-entry issues (we skip the entry check)
    const result = checkCommand(repo);
    const entryIssues = result.issues.filter((i) => i.startsWith(".gitignore missing entry:"));
    expect(entryIssues).toHaveLength(0);
    expect(result.issues).toContain(".gitignore missing at repo root");
  });
});
