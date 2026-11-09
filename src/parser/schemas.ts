import { z } from "zod";
import { CAPABILITIES, ENGINES } from "../types.js";

const IdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/, "id must be kebab-case (lowercase + digits + hyphens)");

const SkillFrontmatterSchema = z
  .object({
    id: IdSchema,
    description: z.string().min(1),
    engines: z.array(z.enum(ENGINES)).min(1).optional(),
    requires: z.array(z.enum(CAPABILITIES)).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

const CmdArgEnumSchema = z
  .object({
    name: z.string().min(1),
    type: z.literal("enum"),
    values: z.array(z.string()).min(1),
    default: z.string().optional(),
  })
  .strict();

const CmdArgStringSchema = z
  .object({
    name: z.string().min(1),
    type: z.literal("string"),
    default: z.string().optional(),
  })
  .strict();

const CmdArgSchema = z.discriminatedUnion("type", [CmdArgEnumSchema, CmdArgStringSchema]);

export type CmdArg = z.infer<typeof CmdArgSchema>;

const CmdFrontmatterSchema = z
  .object({
    id: IdSchema,
    trigger: z.string().regex(/^\/[a-z][a-z0-9-]*$/, "trigger must be /kebab-case"),
    invokes_skill: IdSchema,
    args: z.array(CmdArgSchema).optional(),
    description: z.string().min(1),
  })
  .strict();

export type CmdFrontmatter = z.infer<typeof CmdFrontmatterSchema>;

export const JOURNEY_STATUSES = ["proposed", "implemented", "deprecated"] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

// gray-matter parses a bare YAML date (`2026-11-09`) into a Date object.
const JourneyFrontmatterSchema = z
  .object({
    title: z.string().min(1),
    status: z.enum(JOURNEY_STATUSES),
    actors: z.array(z.string().min(1)).min(1),
    spec: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    last_reviewed: z.union([z.date(), z.string().min(1)]),
  })
  .strict();

export type JourneyFrontmatter = z.infer<typeof JourneyFrontmatterSchema>;

export const Schemas = {
  Skill: SkillFrontmatterSchema,
  Cmd: CmdFrontmatterSchema,
  Journey: JourneyFrontmatterSchema,
} as const;

export class ParseError extends Error {
  constructor(
    public readonly file: string,
    public readonly issues: z.ZodIssue[],
  ) {
    const messages = issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    super(`Frontmatter validation failed for ${file}:\n${messages}`);
    this.name = "ParseError";
  }
}
