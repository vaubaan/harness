import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// npm `version` lifecycle script: keeps src/version.ts equal to package.json.
const repoRoot = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
writeFileSync(resolve(repoRoot, "src/version.ts"), `export const VERSION = "${version}";\n`);
console.log(`✔ src/version.ts → ${version}`);
