# Real harness 0.9.0 manifest

`manifest.json` is the unmodified output of version 0.9.0 at commit
`e0e4e53d4e33ccaaa8c03bd7e72c5a65fe561583` of the pre-open-source repository.

Generation: `git archive` of that commit into a temporary directory,
`npm run build`, then `node dist/cli/index.js init <target> --with-mcp=context7`
(all three engines and the stop-hook are enabled by default). Build
dependencies came from the `node_modules` of the audit checkout.

The migration test recreates the listed files without keeping the old
persona and skill contents. JSON configurations receive valid content;
the manifest, its 74 paths and its version `4` do come from the
historical generator, without manual reconstruction.
