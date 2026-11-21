---
title: Send an invoice
status: implemented
actors: [accountant]
spec: ../spec/invoicing.md
last_reviewed: 2026-11-01
---

# Send an invoice

As an accountant, I want to turn a draft into an invoice and send it, so that the customer pays.

## Issue the draft

requires: draft
creates: invoice
anchors: src/invoicing/issue.ts
spec: ../spec/invoicing.md#1-vision

## Void an invoice

requires: invoice
anchors: src/invoicing/void.ts

## Email the invoice

status: proposed
requires: invoice
acceptance:
- the customer receives a PDF within a minute of issue
- no email is sent for a draft
