---
status: draft
---
# Invoicing — spec

## 0. Vocabulary
- **Invoice**: a frozen statement of amounts due, never edited after issue.
- **Draft**: an invoice before issue; the only editable state.

## 1. Vision
1. A draft becomes an invoice in one irreversible step.
2. An issued invoice can be voided, never deleted.

## 2. Out of scope
- Payment collection. Another subsystem.

## N. Open questions
- Multi-currency: not before a customer asks.
