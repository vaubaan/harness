---
id: canvas
trigger: /canvas
description: Opens the live view of the context; you talk or comment cards, the agent changes the docs, nothing is committed.
args:
  - name: mode
    type: enum
    values:
      - talk
      - comment
    default: talk
    required: false
---

# /canvas

When the human or the agent invokes `/canvas [talk|comment]`, load the
skill `canvas-review` with the optional `mode` argument.

The skill starts a review session (`vaubaan-harness review start`), gives
the URL of the view, and keeps it live: in `talk` mode it applies what the
human says, in `comment` mode it waits for the batches of comments the
human hands over from the view and answers each thread. It ends with
`review keep` or `review discard`, never with a commit.
