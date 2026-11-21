---
tracks:
  - src/invoicing/**/*.ts
  - db/migrations/*.sql
last_reviewed: 2026-10-22
---
# Invoice pipeline

Entry point: `src/invoicing/issue.ts#issueInvoice`. It freezes the
draft, writes the row, emits `invoice.issued`. Storage: see
[postgres-over-sqlite](../decisions/postgres-over-sqlite.md).

Gotcha: `void.ts` keeps the row and flips `status`; reports must filter
on it (`src/reports/monthly.ts`).
