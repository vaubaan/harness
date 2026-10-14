import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    render: "src/render.ts",
    init: "src/cli/init.ts",
    "linters/index": "src/linters/index.ts",
    "parser/index": "src/parser/index.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  target: "node20",
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: false,
});
