---
tracks: [vitest.config.ts, tests/integration/fixtures/*.ts]
---
# Integration tests

## Scope
Invoicing modules against a throwaway database; no browser (→ [e2e](./e2e-tests.md)).

## Conventions
One database per worker (`fixtures/db.ts`); never share a draft across tests.

## Known gaps
- ⚠️ Two workers issuing the same draft ([spec](../spec/invoicing.md#1-vision)) — not tested yet.
