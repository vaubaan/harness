import { describe, expect, it } from "vitest";
import { parseCmd } from "./cmd.js";
import { ParseError } from "./schemas.js";

const VALID_CMD = `---
id: harn-doc-audit
trigger: /harn-doc-audit
invokes_skill: harn-doc-audit
args:
  - name: scope
    type: enum
    values: [spec, decisions, handbook, all]
    default: all
description: Audits the completeness of the project docs.
---

# /harn-doc-audit
`;

describe("parseCmd", () => {
  it("parses a valid cmd frontmatter", () => {
    const cmd = parseCmd("/virtual/harn-doc-audit.cmd.md", VALID_CMD);
    expect(cmd.meta.id).toBe("harn-doc-audit");
    expect(cmd.meta.trigger).toBe("/harn-doc-audit");
    expect(cmd.meta.invokes_skill).toBe("harn-doc-audit");
    expect(cmd.meta.args).toHaveLength(1);
    const arg = cmd.meta.args?.[0];
    expect(arg).toBeDefined();
    if (arg && arg.type === "enum") {
      expect(arg.values).toEqual(["spec", "decisions", "handbook", "all"]);
      expect(arg.default).toBe("all");
    }
  });

  it("accepts a cmd without args", () => {
    const src = `---
id: simple
trigger: /simple
invokes_skill: simple
description: A simple command.
---
body
`;
    const cmd = parseCmd("/s.cmd.md", src);
    expect(cmd.meta.args).toBeUndefined();
  });

  it("accepts an optional argument, required by default", () => {
    const src = (required: string) => `---
id: intent
trigger: /harn-intent
invokes_skill: harn-intent-writer
args:
  - name: intent
    type: string
${required}description: Maps or extends the intent tree.
---
body
`;
    expect(parseCmd("/i.cmd.md", src("    required: false\n")).meta.args?.[0]?.required).toBe(
      false,
    );
    expect(parseCmd("/i.cmd.md", src("")).meta.args?.[0]?.required).toBeUndefined();
    expect(() => parseCmd("/i.cmd.md", src("    required: maybe\n"))).toThrow(ParseError);
  });

  it("rejects trigger without leading slash", () => {
    const src = `---
id: x
trigger: harn-doc-audit
invokes_skill: x
description: x
---
body
`;
    expect(() => parseCmd("/x.cmd.md", src)).toThrow(ParseError);
  });

  it("rejects unknown arg type", () => {
    const src = `---
id: x
trigger: /x
invokes_skill: x
args:
  - name: y
    type: number
description: x
---
body
`;
    expect(() => parseCmd("/x.cmd.md", src)).toThrow(ParseError);
  });
});
