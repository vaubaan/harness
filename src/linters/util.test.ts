import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dirExists,
  fileExists,
  findLineNumber,
  listAllMarkdown,
  listMarkdown,
  parseFrontmatter,
} from "./util.js";

describe("findLineNumber", () => {
  const text = "first line\nsecond line\nthird line";

  it("finds the correct 1-based line with a string needle", () => {
    expect(findLineNumber(text, "second")).toBe(2);
  });

  it("finds the correct 1-based line with a RegExp needle", () => {
    expect(findLineNumber(text, /^third/)).toBe(3);
  });

  it("returns undefined when needle is not found", () => {
    expect(findLineNumber(text, "missing")).toBeUndefined();
  });
});

describe("listMarkdown / listAllMarkdown / dirExists / fileExists", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cah-util-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("listMarkdown returns [] when the directory does not exist", () => {
    expect(listMarkdown(tempDir, "nonexistent")).toEqual([]);
  });

  it("listMarkdown excludes README.md and returns other .md files", () => {
    const dir = "docs";
    mkdirSync(join(tempDir, dir));
    writeFileSync(join(tempDir, dir, "README.md"), "");
    writeFileSync(join(tempDir, dir, "guide.md"), "");
    const result = listMarkdown(tempDir, dir);
    expect(result).not.toContain(expect.stringContaining("README.md"));
    expect(result.some((f) => f.endsWith("guide.md"))).toBe(true);
  });

  it("listAllMarkdown includes README.md", () => {
    const dir = "docs";
    mkdirSync(join(tempDir, dir));
    writeFileSync(join(tempDir, dir, "README.md"), "");
    writeFileSync(join(tempDir, dir, "guide.md"), "");
    const result = listAllMarkdown(tempDir, dir);
    expect(result.some((f) => f.endsWith("README.md"))).toBe(true);
    expect(result.some((f) => f.endsWith("guide.md"))).toBe(true);
  });

  it("dirExists returns true for a directory and false for missing path or file", () => {
    const dir = "subdir";
    mkdirSync(join(tempDir, dir));
    writeFileSync(join(tempDir, "afile.txt"), "");
    expect(dirExists(tempDir, dir)).toBe(true);
    expect(dirExists(tempDir, "missing")).toBe(false);
    expect(dirExists(tempDir, "afile.txt")).toBe(false);
  });

  it("fileExists returns true when file exists", () => {
    writeFileSync(join(tempDir, "present.md"), "");
    expect(fileExists(tempDir, "present.md")).toBe(true);
    expect(fileExists(tempDir, "absent.md")).toBe(false);
  });
});

describe("parseFrontmatter", () => {
  it("parses YAML frontmatter and body correctly", () => {
    const text = "---\ntitle: Hello\nversion: 1\n---\nBody content here.";
    const { data, body } = parseFrontmatter(text);
    expect(data).toEqual({ title: "Hello", version: 1 });
    expect(body.trim()).toBe("Body content here.");
  });
});
