import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseFileWithSchema, parseWithSchema } from "./common.js";
import { ParseError } from "./schemas.js";

const schema = z.object({ title: z.string() });

describe("parseWithSchema", () => {
  it("returns ParsedFile with correct meta, body, and sourcePath for valid frontmatter", () => {
    const src = "---\ntitle: Hello\n---\n\nBody content\n";
    const result = parseWithSchema("/test/file.md", src, schema);
    expect(result.meta.title).toBe("Hello");
    expect(result.body).toBe("Body content");
    expect(result.sourcePath).toBe("/test/file.md");
  });

  it("throws ParseError when a required field is missing", () => {
    const src = "---\nother: value\n---\nbody\n";
    expect(() => parseWithSchema("/test/file.md", src, schema)).toThrow(ParseError);
  });

  it("ParseError carries the filePath and has name === 'ParseError'", () => {
    const src = "---\nother: value\n---\nbody\n";
    try {
      parseWithSchema("/path/to/file.md", src, schema);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      const e = err as ParseError;
      expect(e.file).toBe("/path/to/file.md");
      expect(e.name).toBe("ParseError");
    }
  });

  it("trims leading and trailing whitespace from body", () => {
    const src = "---\ntitle: Trim\n---\n\n\n  Body line\n\n";
    const result = parseWithSchema("/test/file.md", src, schema);
    expect(result.body).toBe("Body line");
  });

  it("throws ParseError when there is no frontmatter (missing required field)", () => {
    const src = "No frontmatter here at all.\n";
    expect(() => parseWithSchema("/test/file.md", src, schema)).toThrow(ParseError);
  });
});

describe("parseFileWithSchema", () => {
  it("reads a file from disk and returns the correct ParsedFile", () => {
    const dir = mkdtempSync(join(tmpdir(), "parser-test-"));
    const filePath = join(dir, "sample.md");
    writeFileSync(filePath, "---\ntitle: From Disk\n---\n\nFile body\n", "utf8");
    const result = parseFileWithSchema(filePath, schema);
    expect(result.meta.title).toBe("From Disk");
    expect(result.body).toBe("File body");
    expect(result.sourcePath).toBe(filePath);
  });
});
