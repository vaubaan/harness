import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const DIRS = ["skills", "commands", "templates"];

for (const dir of DIRS) {
  const src = resolve(repoRoot, "src", dir);
  const dst = resolve(repoRoot, "dist", dir);
  if (!existsSync(src)) {
    console.error(`✘ missing source: ${src}`);
    process.exit(1);
  }
  cpSync(src, dst, { recursive: true });
  console.log(`✔ copied ${dir}/ → dist/${dir}/`);
}
