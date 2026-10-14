# Security

## Reporting a vulnerability

Do not disclose a vulnerability in a public issue. Use
**Security → Report a vulnerability** on
[the GitHub repository](https://github.com/vaubaan/harness/security/advisories/new).

Include the affected version, the reproduction steps and the estimated
impact. We acknowledge receipt within 15 days.

## Supported versions

Only the latest minor version published on npm receives security
fixes.

## Scope

The harness writes into the target project (`init`, `update`, `uninstall`)
and installs Stop hooks executed by the engines. Issues involving writes
outside the project, following symbolic links, configuration leaking into
backups, or execution of unintended commands are in scope.
