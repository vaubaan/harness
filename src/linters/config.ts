import { cosmiconfigSync } from "cosmiconfig";

export interface HarnessLintConfig {
  ignore: ReadonlyArray<string>;
}

const DEFAULT_CONFIG: HarnessLintConfig = { ignore: [] };

export function loadLintConfig(repoRoot: string): HarnessLintConfig {
  const explorer = cosmiconfigSync("harness", {
    searchPlaces: [
      "package.json",
      ".harnessrc",
      ".harnessrc.json",
      ".harnessrc.yaml",
      ".harnessrc.yml",
      "harness.config.js",
      "harness.config.cjs",
    ],
  });
  const result = explorer.search(repoRoot);
  if (!result || result.isEmpty) return DEFAULT_CONFIG;

  const raw = result.config as Record<string, unknown> | undefined;
  if (!raw) return DEFAULT_CONFIG;

  const lint = raw.lint as Record<string, unknown> | undefined;
  if (!lint) return DEFAULT_CONFIG;

  const ignore = lint.ignore;
  if (!Array.isArray(ignore)) return DEFAULT_CONFIG;

  return { ignore: ignore.filter((x): x is string => typeof x === "string") };
}
