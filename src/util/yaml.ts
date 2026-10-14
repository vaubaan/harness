import { parse as yamlParse } from "yaml";

export function parseYAML(source: string): unknown {
  return yamlParse(source);
}
