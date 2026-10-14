import { describe, expect, it } from "vitest";
import { parseCmd } from "./cmd.js";
import { ParseError } from "./schemas.js";

const VALID_CMD = `---
id: doc-audit
trigger: /doc-audit
invokes_skill: doc-audit
args:
  - name: scope
    type: enum
    values: [spec, decisions, handbook, all]
    default: all
description: Audits the completeness of the project docs.
---

# /doc-audit
`;

describe("parseCmd", () => {
  it("parses a valid cmd frontmatter", () => {
    const cmd = parseCmd("/virtual/doc-audit.cmd.md", VALID_CMD);
    expect(cmd.meta.id).toBe("doc-audit");
    expect(cmd.meta.trigger).toBe("/doc-audit");
    expect(cmd.meta.invokes_skill).toBe("doc-audit");
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

  it("rejects trigger without leading slash", () => {
    const src = `---
id: x
trigger: doc-audit
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
